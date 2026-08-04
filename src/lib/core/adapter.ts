// Supabase-backed replacement for legacy/core.js.
//
// Design: sync reads over an in-memory State that mirrors the myday.v1 shape,
// so the vanilla-JS UI in app.js keeps working with almost no changes. Writes
// are OPTIMISTIC — the in-memory state is mutated immediately, the server RPC
// fires in the background, and the change is rolled back on failure via a
// re-hydrate + toast callback.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { loadCached, saveCached } from "./cache";
import { hydrate } from "./hydrate";
import {
  WIN,
  completionsToday,
  dateKey,
  dow,
  isCompleted,
  logicalDateObj,
  nowHour,
  taskState,
  tsInDates,
  weekDates,
} from "./rules";
import type {
  Child,
  Completion,
  Goal,
  LedgerEntry,
  NextAlarm,
  Result,
  State,
  Task,
  TaskState,
} from "./types";
import { hashPin } from "../pin";

export type Notify = (kind: "info" | "error", text: string) => void;

const PALETTE: Array<[string, string]> = [
  ["#ff9f5c", "#ffe4cc"],
  ["#ff7fb0", "#ffd9e8"],
  ["#34c08a", "#cdeede"],
  ["#8a7ff0", "#e6e2fb"],
  ["#5aa9e6", "#d6ecfb"],
  ["#e6b800", "#fff0bf"],
];

type Row = Record<string, any>;

export class Core {
  private state: State;
  private supabase: SupabaseClient;
  private onChange: () => void;
  private notify: Notify;
  private channel: RealtimeChannel | null = null;

  constructor(state: State, supabase: SupabaseClient, onChange: () => void, notify: Notify) {
    this.state = state;
    this.supabase = supabase;
    this.onChange = onChange;
    this.notify = notify;
  }

  static async create(
    supabase: SupabaseClient,
    tenantId: string,
    onChange: () => void,
    notify: Notify,
  ): Promise<Core> {
    const cached = loadCached(tenantId);
    let state: State;
    if (cached) {
      state = cached;
      // Kick off a background refresh but return the cached state immediately.
      void hydrate(supabase).then((fresh) => {
        Object.assign(state, fresh);
        saveCached(state);
        onChange();
      });
    } else {
      state = await hydrate(supabase);
      saveCached(state);
    }
    const core = new Core(state, supabase, onChange, notify);
    core.subscribeRealtime();
    return core;
  }

  // ------------------------------------------------------------------ realtime
  private subscribeRealtime() {
    const t = this.state.tenantId;
    this.channel = this.supabase
      .channel(`tenant:${t}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "children",     filter: `tenant_id=eq.${t}` }, () => this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks",        filter: `tenant_id=eq.${t}` }, () => this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "goals",        filter: `tenant_id=eq.${t}` }, () => this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "completions",  filter: `tenant_id=eq.${t}` }, () => this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger",       filter: `tenant_id=eq.${t}` }, () => this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "applied",      filter: `tenant_id=eq.${t}` }, () => this.refresh())
      .subscribe();
  }

  private async refresh() {
    try {
      const fresh = await hydrate(this.supabase);
      Object.assign(this.state, fresh);
      saveCached(this.state);
      this.onChange();
    } catch (err) {
      this.notify("error", (err as Error).message);
    }
  }

  destroy() {
    if (this.channel) void this.supabase.removeChannel(this.channel);
    this.channel = null;
  }

  // ---------------------------------------------------------------------- read
  getState(): State { return this.state; }
  child(id: string): Child | undefined     { return this.state.children.find((c) => c.id === id); }
  task(id: string): Task | undefined       { return this.state.tasks.find((t) => t.id === id); }
  goal(id: string): Goal | undefined       { return this.state.goals.find((g) => g.id === id); }
  dateKey = (at: Date | number | string) => dateKey(at);
  dow = (at: Date | number | string) => dow(at);
  nowHour = (at: Date | number | string) => nowHour(at);
  logicalDateObj = (at: Date | number | string) => logicalDateObj(at);
  WIN = WIN;

  taskState(task: Task, at: Date | number | string): TaskState {
    return taskState(this.state, task, at);
  }

  tasksForChildToday(childId: string, at: Date | number | string) {
    return this.state.tasks
      .filter((t) => t.childId === childId)
      .map((t) => ({ task: t, state: taskState(this.state, t, at) }))
      .filter((r) => r.state !== "inactive");
  }

  nextAlarm(childId: string, at: Date | number | string): NextAlarm | null {
    const s = this.state.settings;
    const lead = 60 * (s.alarmLeadMin || 5);
    const ring = s.alarmRingSec || 60;
    const vis = s.alarmVisibleSec || 300;
    const now = new Date(at).getTime();
    const anchor = new Date(at);
    const d = dow(at);
    const key = dateKey(at);
    let best: NextAlarm | null = null;

    for (const task of this.state.tasks) {
      if (task.childId !== childId || !task.active || !task.alarm || task.mute || !task.time) continue;
      if (task.days.indexOf(d) < 0 || isCompleted(this.state, childId, task.id, key)) continue;
      const [hh, mm] = String(task.time).split(":");
      const at0 = new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate(),
        parseInt(hh, 10),
        parseInt(mm || "0", 10),
        0,
        0,
      ).getTime();
      const snoozed = this.state.snoozes[task.id + ":" + key];
      const when = snoozed && snoozed > at0 ? snoozed : at0;
      const secs = (when - now) / 1000;
      if (secs < -vis) continue;
      if (!best || secs < best.secs) {
        best = {
          task,
          at: when,
          secs,
          phase: "idle",
          secsToGo: 0,
          snoozeMin: s.snoozeMin || 5,
          snoozed: !!snoozed,
        };
      }
    }

    if (!best) return null;
    const secs = best.secs;
    best.phase = secs > lead ? "idle" : secs > 0 ? "soon" : secs >= -ring ? "ring" : "due";
    best.secsToGo = Math.max(0, Math.round(secs));
    return best;
  }

  balance(childId: string): number {
    return this.child(childId)?.balance ?? 0;
  }
  kidBalance(childId: string): number {
    return Math.max(0, this.balance(childId));
  }
  goalsFor(childId: string, status?: Goal["status"]): Goal[] {
    return this.state.goals.filter((g) => g.childId === childId && (!status || g.status === status));
  }
  isGoalRedeemedToday(_childId: string, goalId: string, at: Date | number | string): boolean {
    return !!this.state.applied[`goal:${goalId}:${dateKey(at)}`];
  }
  earnedToday(childId: string, at: Date | number | string): number {
    return completionsToday(this.state, childId, at).reduce((n, c) => n + c.amount, 0);
  }
  possibleToday(childId: string, at: Date | number | string): number {
    const d = dow(at);
    return this.state.tasks
      .filter((t) => t.childId === childId && t.active && t.win !== "Bonus" && t.days.indexOf(d) >= 0)
      .reduce((n, t) => n + t.amount, 0);
  }
  pendingToday(childId: string, at: Date | number | string) {
    return completionsToday(this.state, childId, at).map((c) => ({
      completion: c,
      task: this.task(c.taskId),
    }));
  }
  disputable(completionId: string, at: Date | number | string): boolean {
    const c = this.state.completions.find((x) => x.id === completionId);
    return !!c && c.status === "done" && c.date === dateKey(at);
  }
  weeklySummary(childId: string, at: Date | number | string) {
    const dates = weekDates(at);
    const done = this.state.completions.filter(
      (c) => c.childId === childId && c.status === "done" && dates.includes(c.date),
    ).length;
    const earned = this.state.ledger
      .filter((l) => l.childId === childId && (l.type === "earn" || l.type === "bonus") && tsInDates(l.ts, dates))
      .reduce((n, l) => n + l.amount, 0);
    const spent = this.state.ledger
      .filter((l) => l.childId === childId && l.type === "spend" && tsInDates(l.ts, dates))
      .reduce((n, l) => n + Math.abs(l.amount), 0);
    let scheduled = 0;
    dates.forEach((d) => {
      const w = (new Date(`${d}T12:00:00`).getDay() + 6) % 7;
      scheduled += this.state.tasks.filter(
        (t) => t.childId === childId && t.active && t.win !== "Bonus" && t.days.indexOf(w) >= 0,
      ).length;
    });
    return { done, scheduled, missed: Math.max(0, scheduled - done), earned, spent };
  }

  // --------------------------------------------------------------------- write
  // All writes are optimistic: mutate local state, fire RPC, revert on failure.

  async complete(childId: string, taskId: string, at: Date | number | string): Promise<Result> {
    const t = this.task(taskId);
    if (!t) return { ok: false, reason: "no-task" };
    const s = this.taskState(t, at);
    if (s !== "available") return { ok: false, reason: s };

    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const key = dateKey(at);
    const ts = new Date(at).getTime();
    const optimistic: Completion = {
      id: tempId,
      childId,
      taskId,
      date: key,
      ts,
      amount: t.amount,
      status: "done",
      manual: false,
    };
    this.state.completions.push(optimistic);
    this.state.ledger.push({
      id: tempId + "_l",
      childId,
      ts,
      type: t.win === "Bonus" ? "bonus" : "earn",
      amount: t.amount,
      note: t.en,
    });
    const child = this.child(childId);
    if (child) child.balance += t.amount;
    saveCached(this.state);
    this.onChange();

    const { data, error } = await this.supabase.rpc("complete_task", {
      p_child: childId,
      p_task: taskId,
      p_at: new Date(at).toISOString(),
    });
    if (error || !(data as Result)?.ok) {
      this.notify("error", error?.message ?? (data as Result)?.reason ?? "Could not save");
      await this.refresh();
      return { ok: false, reason: "server" };
    }
    void this.refresh();
    return { ok: true, coins: t.amount };
  }

  async undo(completionId: string): Promise<Result> {
    const idx = this.state.completions.findIndex((c) => c.id === completionId);
    if (idx < 0) return { ok: false };
    const c = this.state.completions[idx];
    this.state.completions.splice(idx, 1);
    if (c.status === "done") {
      const child = this.child(c.childId);
      if (child) child.balance -= c.amount;
      this.state.ledger.push({
        id: `tmp_${Date.now()}_undo`,
        childId: c.childId,
        ts: Date.now(),
        type: "undo",
        amount: -c.amount,
        note: "Undo",
      });
    }
    saveCached(this.state);
    this.onChange();

    if (completionId.startsWith("tmp_")) return { ok: true };
    const { error } = await this.supabase.rpc("undo_completion", { p_completion: completionId });
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
      return { ok: false };
    }
    return { ok: true };
  }

  async dispute(completionId: string, at: Date | number | string): Promise<Result> {
    const c = this.state.completions.find((x) => x.id === completionId);
    if (!c || c.status !== "done") return { ok: false, reason: "missing" };
    if (c.date !== dateKey(at)) return { ok: false, reason: "locked" };
    c.status = "disputed";
    const child = this.child(c.childId);
    if (child) child.balance -= c.amount;
    saveCached(this.state);
    this.onChange();

    const { error } = await this.supabase.rpc("dispute_completion", {
      p_completion: completionId,
      p_at: new Date(at).toISOString(),
    });
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
      return { ok: false };
    }
    return { ok: true };
  }

  async redeemGoal(childId: string, goalId: string, at: Date | number | string): Promise<Result> {
    const g = this.goal(goalId);
    if (!g) return { ok: false, reason: "no-goal" };
    const key = `goal:${goalId}:${dateKey(at)}`;
    if (this.state.applied[key] && !g.repeatableDaily) return { ok: false, reason: "already-redeemed" };
    const child = this.child(childId);
    if (!child || child.balance < g.price) return { ok: false, reason: "insufficient-balance" };

    child.balance -= g.price;
    this.state.applied[key] = true;
    this.state.ledger.push({
      id: `tmp_${Date.now()}_redeem`,
      childId,
      ts: new Date(at).getTime(),
      type: "spend",
      amount: -g.price,
      note: "Redeemed: " + g.name,
    });
    saveCached(this.state);
    this.onChange();

    const { data, error } = await this.supabase.rpc("redeem_goal", {
      p_child: childId,
      p_goal: goalId,
      p_at: new Date(at).toISOString(),
    });
    if (error || !(data as Result)?.ok) {
      this.notify("error", error?.message ?? (data as Result)?.reason ?? "Could not redeem");
      await this.refresh();
      return { ok: false, reason: "server" };
    }
    return { ok: true, coins: g.price };
  }

  async snooze(_childId: string, taskId: string, at: Date | number | string): Promise<Result> {
    const mins = this.state.settings.snoozeMin || 5;
    const key = taskId + ":" + dateKey(at);
    this.state.snoozes[key] = new Date(at).getTime() + mins * 60_000;
    saveCached(this.state);
    this.onChange();
    const { error } = await this.supabase.rpc("snooze_task", {
      p_task: taskId,
      p_at: new Date(at).toISOString(),
    });
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
      return { ok: false };
    }
    return { ok: true, mins };
  }

  // ---- direct writes (no gameplay rules, just persistence) ------------------

  async addChild(input: Partial<Child> & { name?: string }): Promise<string> {
    const palette = PALETTE[this.state.children.length % PALETTE.length];
    const row: Row = {
      tenant_id: this.state.tenantId,
      name: input.name || "Child",
      av: input.av || "🙂",
      color: input.color || palette[0],
      color_lite: input.colorLite || palette[1],
    };
    const { data, error } = await this.supabase.from("children").insert(row).select("*").single();
    if (error || !data) {
      this.notify("error", error?.message ?? "Could not add child");
      throw error ?? new Error("insert-failed");
    }
    const d = data as Row;
    this.state.children.push({
      id: d.id,
      name: d.name,
      av: d.av,
      color: d.color,
      colorLite: d.color_lite,
      balance: d.balance,
    });
    saveCached(this.state);
    this.onChange();
    return d.id;
  }

  async updateChild(id: string, patch: Partial<Child>): Promise<void> {
    const child = this.child(id);
    if (!child) return;
    Object.assign(child, patch);
    saveCached(this.state);
    this.onChange();
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.av !== undefined) row.av = patch.av;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.colorLite !== undefined) row.color_lite = patch.colorLite;
    if (patch.balance !== undefined) row.balance = patch.balance;
    const { error } = await this.supabase.from("children").update(row).eq("id", id);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
    }
  }

  async removeChild(id: string): Promise<void> {
    this.state.children = this.state.children.filter((c) => c.id !== id);
    this.state.tasks = this.state.tasks.filter((t) => t.childId !== id);
    this.state.goals = this.state.goals.filter((g) => g.childId !== id);
    saveCached(this.state);
    this.onChange();
    const { error } = await this.supabase.from("children").delete().eq("id", id);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
    }
  }

  async addTask(childId: string, input: Partial<Task>): Promise<Task> {
    const row: Row = {
      tenant_id: this.state.tenantId,
      child_id: childId,
      icon: input.icon || "🙂",
      en: input.en || "",
      af: input.af || "",
      win: input.win || "Morning",
      time: input.time || null,
      amount: Number(input.amount) || 0,
      alarm: !!input.alarm,
      mute: !!input.mute,
      penalty: Number(input.penalty) || 0,
      carry: input.carry || "none",
      days: input.days ?? [0, 1, 2, 3, 4, 5, 6],
      active: input.active !== false,
    };
    const { data, error } = await this.supabase.from("tasks").insert(row).select("*").single();
    if (error || !data) {
      this.notify("error", error?.message ?? "Could not add task");
      throw error ?? new Error("insert-failed");
    }
    const d = data as Row;
    const t: Task = {
      id: d.id,
      childId: d.child_id,
      icon: d.icon,
      en: d.en,
      af: d.af,
      win: d.win,
      time: d.time,
      amount: d.amount,
      alarm: d.alarm,
      mute: d.mute,
      penalty: d.penalty,
      carry: d.carry,
      days: d.days,
      active: d.active,
    };
    this.state.tasks.push(t);
    saveCached(this.state);
    this.onChange();
    return t;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    const t = this.task(id);
    if (!t) return undefined;
    Object.assign(t, patch);
    saveCached(this.state);
    this.onChange();
    const row: Row = {};
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.en !== undefined) row.en = patch.en;
    if (patch.af !== undefined) row.af = patch.af;
    if (patch.win !== undefined) row.win = patch.win;
    if (patch.time !== undefined) row.time = patch.time;
    if (patch.amount !== undefined) row.amount = patch.amount;
    if (patch.alarm !== undefined) row.alarm = patch.alarm;
    if (patch.mute !== undefined) row.mute = patch.mute;
    if (patch.penalty !== undefined) row.penalty = patch.penalty;
    if (patch.carry !== undefined) row.carry = patch.carry;
    if (patch.days !== undefined) row.days = patch.days;
    if (patch.active !== undefined) row.active = patch.active;
    const { error } = await this.supabase.from("tasks").update(row).eq("id", id);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
    }
    return t;
  }

  async removeTask(id: string): Promise<void> {
    this.state.tasks = this.state.tasks.filter((t) => t.id !== id);
    saveCached(this.state);
    this.onChange();
    const { error } = await this.supabase.from("tasks").delete().eq("id", id);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
    }
  }

  async copyDay(childId: string, from: number, to: number[]): Promise<void> {
    const tasks = this.state.tasks.filter((t) => t.childId === childId);
    const changed: Array<{ id: string; days: number[] }> = [];
    for (const day of to) {
      for (const t of tasks) {
        const has = t.days.indexOf(from) >= 0;
        const idx = t.days.indexOf(day);
        if (has && idx < 0) t.days = [...t.days, day];
        if (!has && idx >= 0) t.days = t.days.filter((d) => d !== day);
        changed.push({ id: t.id, days: t.days });
      }
    }
    saveCached(this.state);
    this.onChange();
    for (const c of changed) {
      const { error } = await this.supabase.from("tasks").update({ days: c.days }).eq("id", c.id);
      if (error) {
        this.notify("error", error.message);
        await this.refresh();
        return;
      }
    }
  }

  async cloneWeek(sourceChildId: string, targetChildId: string): Promise<void> {
    if (sourceChildId === targetChildId) return;
    const sourceTasks = this.state.tasks.filter((task) => task.childId === sourceChildId);
    const targetTasks = this.state.tasks.filter((task) => task.childId === targetChildId);

    this.state.tasks = this.state.tasks.filter((task) => task.childId !== targetChildId);
    const clones = sourceTasks.map((task) => ({
      child_id: targetChildId,
      icon: task.icon,
      en: task.en,
      af: task.af,
      win: task.win,
      time: task.time,
      amount: task.amount,
      alarm: task.alarm,
      mute: task.mute,
      penalty: task.penalty,
      carry: task.carry,
      days: task.days,
      active: task.active,
      tenant_id: this.state.tenantId,
    }));

    saveCached(this.state);
    this.onChange();

    const { error: deleteError } = await this.supabase.from("tasks").delete().eq("tenant_id", this.state.tenantId).eq("child_id", targetChildId);
    if (deleteError) {
      this.notify("error", deleteError.message);
      await this.refresh();
      return;
    }

    if (clones.length) {
      const { error: insertError } = await this.supabase.from("tasks").insert(clones).select("*");
      if (insertError) {
        this.notify("error", insertError.message);
        await this.refresh();
        return;
      }
    }

    void targetTasks;
    await this.refresh();
  }

  async addGoal(childId: string, input: Partial<Goal>): Promise<void> {
    const row: Row = {
      tenant_id: this.state.tenantId,
      child_id: childId,
      icon: input.icon || "🎁",
      name: input.name || "Goal",
      price: Number(input.price) || 0,
      status: input.status || "active",
      repeatable_daily: !!input.repeatableDaily,
    };
    const { data, error } = await this.supabase.from("goals").insert(row).select("*").single();
    if (error || !data) {
      this.notify("error", error?.message ?? "Could not add goal");
      return;
    }
    const d = data as Row;
    this.state.goals.push({
      id: d.id,
      childId: d.child_id,
      icon: d.icon,
      name: d.name,
      price: d.price,
      status: d.status,
      repeatableDaily: d.repeatable_daily,
    });
    saveCached(this.state);
    this.onChange();
  }

  async updateGoal(id: string, patch: Partial<Goal>): Promise<void> {
    const g = this.goal(id);
    if (!g) return;
    Object.assign(g, patch);
    saveCached(this.state);
    this.onChange();
    const row: Row = {};
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.repeatableDaily !== undefined) row.repeatable_daily = patch.repeatableDaily;
    const { error } = await this.supabase.from("goals").update(row).eq("id", id);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
    }
  }

  async setGoalStatus(id: string, status: Goal["status"]): Promise<void> {
    return this.updateGoal(id, { status });
  }

  async deleteGoal(id: string): Promise<void> {
    this.state.goals = this.state.goals.filter((g) => g.id !== id);
    saveCached(this.state);
    this.onChange();
    const { error } = await this.supabase.from("goals").delete().eq("id", id);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
    }
  }

  // Wallet adjustments — server-side ledger insert + local child balance update.
  private async ledgerAdjust(
    childId: string,
    delta: number,
    type: LedgerEntry["type"],
    note: string,
  ): Promise<void> {
    const child = this.child(childId);
    if (child) child.balance += delta;
    this.state.ledger.unshift({
      id: `tmp_${Date.now()}_${type}`,
      childId,
      ts: Date.now(),
      type,
      amount: delta,
      note,
    });
    saveCached(this.state);
    this.onChange();

    const { error: e1 } = await this.supabase.from("ledger").insert({
      tenant_id: this.state.tenantId,
      child_id: childId,
      type,
      amount: delta,
      note,
    });
    const { error: e2 } = await this.supabase
      .from("children")
      .update({ balance: child?.balance ?? 0 })
      .eq("id", childId);
    if (e1 || e2) {
      this.notify("error", (e1 ?? e2)!.message);
      await this.refresh();
    }
  }

  spend(childId: string, amount: number, note?: string): Promise<void> {
    return this.ledgerAdjust(childId, -Math.abs(amount), "spend", note || "Spent");
  }
  advance(childId: string, amount: number, note?: string): Promise<void> {
    return this.ledgerAdjust(childId, Math.abs(amount), "advance", note || "Advance");
  }
  adjust(childId: string, amount: number, note?: string): Promise<void> {
    return this.ledgerAdjust(childId, amount, "adjust", note || "Adjustment");
  }

  async setPin(pin: string): Promise<Result> {
    const digits = String(pin ?? "").replace(/\D/g, "").slice(0, 4);
    if (digits.length !== 4) return { ok: false, reason: "need-4-digits" };
    const hash = await hashPin(digits, this.state.tenantId);
    this.state.pinHash = hash;
    saveCached(this.state);
    this.onChange();
    const { error } = await this.supabase
      .from("settings")
      .update({ pin_hash: hash })
      .eq("tenant_id", this.state.tenantId);
    if (error) {
      this.notify("error", error.message);
      await this.refresh();
      return { ok: false };
    }
    return { ok: true };
  }

  async setKidLang(lang: State["kidLang"]): Promise<void> {
    this.state.kidLang = lang;
    saveCached(this.state);
    this.onChange();
    const { error } = await this.supabase
      .from("settings")
      .update({ kid_lang: lang })
      .eq("tenant_id", this.state.tenantId);
    if (error) this.notify("error", error.message);
  }

  async updateSettings(patch: Partial<State["settings"]>): Promise<void> {
    Object.assign(this.state.settings, patch);
    saveCached(this.state);
    this.onChange();
    const row: Row = {};
    if (patch.dayStart !== undefined) row.day_start = patch.dayStart;
    if (patch.weeklySummary !== undefined) row.weekly_summary = patch.weeklySummary;
    if (patch.holdMs !== undefined) row.hold_ms = patch.holdMs;
    if (patch.alarmLeadMin !== undefined) row.alarm_lead_min = patch.alarmLeadMin;
    if (patch.alarmRingSec !== undefined) row.alarm_ring_sec = patch.alarmRingSec;
    if (patch.snoozeMin !== undefined) row.snooze_min = patch.snoozeMin;
    if (patch.screenTimeStart !== undefined) row.screen_time_start = patch.screenTimeStart;
    if (patch.screenTimeEnd !== undefined) row.screen_time_end = patch.screenTimeEnd;
    if (patch.weatherEnabled !== undefined) row.weather_enabled = patch.weatherEnabled;
    if (Object.keys(row).length === 0) return;
    const { error } = await this.supabase
      .from("settings")
      .update(row)
      .eq("tenant_id", this.state.tenantId);
    if (error) this.notify("error", error.message);
  }
}
