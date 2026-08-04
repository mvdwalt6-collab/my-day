// Fetches all rows for the caller's tenant and assembles a legacy-shaped State.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Child,
  Completion,
  Goal,
  LedgerEntry,
  MemberRole,
  State,
  Task,
  TenantStatus,
} from "./types";

// Server rows -> legacy shape. The DB uses snake_case; the client wants camelCase.
type ChildRow = {
  id: string;
  name: string;
  av: string;
  color: string;
  color_lite: string;
  balance: number;
};
type TaskRow = {
  id: string;
  child_id: string;
  icon: string;
  en: string;
  af: string;
  win: Task["win"];
  time: string | null;
  amount: number;
  alarm: boolean;
  mute: boolean;
  penalty: number;
  carry: Task["carry"];
  days: number[];
  active: boolean;
};
type GoalRow = {
  id: string;
  child_id: string;
  icon: string;
  name: string;
  price: number;
  status: Goal["status"];
  repeatable_daily: boolean;
};
type CompletionRow = {
  id: string;
  child_id: string;
  task_id: string;
  date: string;
  ts: string;
  amount: number;
  status: Completion["status"];
  manual: boolean;
};
type LedgerRow = {
  id: string;
  child_id: string;
  ts: string;
  type: LedgerEntry["type"];
  amount: number;
  note: string;
};
type AppliedRow = { key: string };
type SnoozeRow = { task_id: string; date: string; snooze_until: string };
type SettingsRow = {
  day_start: number;
  weekly_summary: boolean;
  hold_ms: number;
  alarm_lead_min: number;
  alarm_ring_sec: number;
  alarm_visible_sec: number;
  snooze_min: number;
  screen_time_start: string;
  screen_time_end: string;
  weather_enabled: boolean;
  kid_lang: State["kidLang"];
  pin_hash: string | null;
};
type TenantMemberRow = {
  role: MemberRole;
  tenants: { id: string; name: string; status: TenantStatus } | null;
};

export async function hydrate(supabase: SupabaseClient): Promise<State> {
  const { data: member, error: memberError } = await supabase
    .from("tenant_members")
    .select("role, tenants!inner(id, name, status)")
    .maybeSingle<TenantMemberRow>();

  if (memberError) throw memberError;
  if (!member || !member.tenants) throw new Error("no-tenant");

  const tenantId = member.tenants.id;

  const [
    { data: settings, error: sErr },
    { data: children, error: cErr },
    { data: tasks, error: tErr },
    { data: goals, error: gErr },
    { data: completions, error: coErr },
    { data: ledger, error: lErr },
    { data: applied, error: aErr },
    { data: snoozes, error: snErr },
  ] = await Promise.all([
    supabase.from("settings").select("*").eq("tenant_id", tenantId).maybeSingle<SettingsRow>(),
    supabase.from("children").select("*").eq("tenant_id", tenantId).order("sort_order").returns<ChildRow[]>(),
    supabase.from("tasks").select("*").eq("tenant_id", tenantId).returns<TaskRow[]>(),
    supabase.from("goals").select("*").eq("tenant_id", tenantId).returns<GoalRow[]>(),
    supabase.from("completions").select("*").eq("tenant_id", tenantId).returns<CompletionRow[]>(),
    supabase.from("ledger").select("*").eq("tenant_id", tenantId).order("ts", { ascending: false }).limit(500).returns<LedgerRow[]>(),
    supabase.from("applied").select("key").eq("tenant_id", tenantId).returns<AppliedRow[]>(),
    supabase.from("snoozes").select("task_id, date, snooze_until").eq("tenant_id", tenantId).returns<SnoozeRow[]>(),
  ]);

  const err = sErr ?? cErr ?? tErr ?? gErr ?? coErr ?? lErr ?? aErr ?? snErr;
  if (err) throw err;

  const appliedMap: Record<string, boolean> = {};
  (applied ?? []).forEach((r) => (appliedMap[r.key] = true));

  const snoozeMap: Record<string, number> = {};
  (snoozes ?? []).forEach((r) => (snoozeMap[`${r.task_id}:${r.date}`] = new Date(r.snooze_until).getTime()));

  return {
    tenantId,
    familyName: member.tenants.name,
    tenantStatus: member.tenants.status,
    role: member.role,
    kidLang: settings?.kid_lang ?? "af",
    pinHash: settings?.pin_hash ?? null,
    settings: {
      dayStart: settings?.day_start ?? 4,
      weeklySummary: settings?.weekly_summary ?? true,
      holdMs: settings?.hold_ms ?? 650,
      alarmLeadMin: settings?.alarm_lead_min ?? 5,
      alarmRingSec: settings?.alarm_ring_sec ?? 60,
      alarmVisibleSec: settings?.alarm_visible_sec ?? 300,
      snoozeMin: settings?.snooze_min ?? 5,
      screenTimeStart: settings?.screen_time_start ?? "18:00",
      screenTimeEnd: settings?.screen_time_end ?? "19:00",
      weatherEnabled: settings?.weather_enabled ?? true,
    },
    children: (children ?? []).map<Child>((r) => ({
      id: r.id,
      name: r.name,
      av: r.av,
      color: r.color,
      colorLite: r.color_lite,
      balance: r.balance,
    })),
    tasks: (tasks ?? []).map<Task>((r) => ({
      id: r.id,
      childId: r.child_id,
      icon: r.icon,
      en: r.en,
      af: r.af,
      win: r.win,
      time: r.time,
      amount: r.amount,
      alarm: r.alarm,
      mute: r.mute,
      penalty: r.penalty,
      carry: r.carry,
      days: r.days,
      active: r.active,
    })),
    goals: (goals ?? []).map<Goal>((r) => ({
      id: r.id,
      childId: r.child_id,
      icon: r.icon,
      name: r.name,
      price: r.price,
      status: r.status,
      repeatableDaily: r.repeatable_daily,
    })),
    completions: (completions ?? []).map<Completion>((r) => ({
      id: r.id,
      childId: r.child_id,
      taskId: r.task_id,
      date: r.date,
      ts: new Date(r.ts).getTime(),
      amount: r.amount,
      status: r.status,
      manual: r.manual,
    })),
    ledger: (ledger ?? []).map<LedgerEntry>((r) => ({
      id: r.id,
      childId: r.child_id,
      ts: new Date(r.ts).getTime(),
      type: r.type,
      amount: r.amount,
      note: r.note,
    })),
    applied: appliedMap,
    snoozes: snoozeMap,
  };
}
