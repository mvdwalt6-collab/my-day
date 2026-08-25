"use client";

import { useEffect, useState } from "react";

import { Core } from "@/lib/core/adapter";
import { createClient } from "@/lib/supabase/client";
import { verifyPin } from "@/lib/pin";
import type { Child, Goal, Task, Window } from "@/lib/core/types";

type Props = {
  tenantId: string;
  familyName: string;
  email: string;
};

const WINDOWS: Window[] = ["Morning", "Afternoon", "Evening", "Bonus"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLOR_CHOICES = [
  ["#ff9f5c", "#ffe4cc"],
  ["#ff7fb0", "#ffd9e8"],
  ["#34c08a", "#cdeede"],
  ["#8a7ff0", "#e6e2fb"],
  ["#5aa9e6", "#d6ecfb"],
  ["#e6b800", "#fff0bf"],
] as const;
const AVATAR_CHOICES = ["🙂", "🦖", "🐰", "🦁", "🦊", "🐻", "🐱", "🐶", "🦄", "🐸"];

type BoardMode = "kids" | "parent";
type ParentTab = "board" | "manage" | "settings";

const PARENT_TABS: Array<{ id: ParentTab; label: string }> = [
  { id: "board", label: "Board" },
  { id: "manage", label: "Manage" },
  { id: "settings", label: "Settings" },
];

type ChildDraft = {
  name: string;
  av: string;
  color: string;
  colorLite: string;
};

type TaskEditor = {
  id?: string;
  childId: string;
  icon: string;
  en: string;
  af: string;
  win: Window;
  time: string;
  amount: string;
  alarm: boolean;
  mute: boolean;
  penalty: string;
  carry: Task["carry"];
  days: number[];
  active: boolean;
};

type GoalEditor = {
  id?: string;
  childId: string;
  icon: string;
  name: string;
  price: string;
  status: Goal["status"];
  repeatableDaily: boolean;
};

type MoneyAction = "award" | "deduct" | "spend" | "advance";

const MONEY_ACTIONS: Array<{ id: MoneyAction; label: string; hint: string }> = [
  { id: "award", label: "Award", hint: "Special award — adds money to the wallet" },
  { id: "deduct", label: "Deduct", hint: "Punishment or correction — takes money out" },
  { id: "spend", label: "Spend", hint: "Child spends saved money on something" },
  { id: "advance", label: "Advance", hint: "Pocket-money loan against future earnings" },
];

function makeTaskEditor(childId = ""): TaskEditor {
  return {
    childId,
    icon: "🙂",
    en: "",
    af: "",
    win: "Morning",
    time: "",
    amount: "1",
    alarm: true,
    mute: false,
    penalty: "0",
    carry: "none",
    days: [0, 1, 2, 3, 4, 5, 6],
    active: true,
  };
}

function makeGoalEditor(childId = ""): GoalEditor {
  return {
    childId,
    icon: "🎁",
    name: "",
    price: "0",
    status: "active",
    repeatableDaily: false,
  };
}

function windowLabel(value: Window) {
  return value;
}

function formatMoney(value: number) {
  return `R${value.toFixed(0)}`;
}

function formatClock(value: number) {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDuration(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function isTaskEditor(editor: TaskEditor, task: Task) {
  return editor.id === task.id;
}

export default function HomeBoard({ tenantId, familyName, email }: Props) {
  const [supabase] = useState(() => createClient());
  const [core, setCore] = useState<Core | null>(null);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childDraft, setChildDraft] = useState<ChildDraft>({ name: "", av: "🙂", color: COLOR_CHOICES[2][0], colorLite: COLOR_CHOICES[2][1] });
  const [newChild, setNewChild] = useState<ChildDraft>({ name: "", av: "🙂", color: COLOR_CHOICES[2][0], colorLite: COLOR_CHOICES[2][1] });
  const [taskEditor, setTaskEditor] = useState<TaskEditor>(makeTaskEditor());
  const [goalEditor, setGoalEditor] = useState<GoalEditor>(makeGoalEditor());
  const [moneyAction, setMoneyAction] = useState<MoneyAction>("award");
  const [moneyAmount, setMoneyAmount] = useState("0");
  const [moneyNote, setMoneyNote] = useState("");
  const [copyFromDay, setCopyFromDay] = useState(0);
  const [copyToDays, setCopyToDays] = useState<number[]>([]);
  const [cloneTargetId, setCloneTargetId] = useState<string>("");
  const [toast, setToast] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [mode, setMode] = useState<BoardMode>("kids");
  const [parentTab, setParentTab] = useState<ParentTab>("board");
  const [openEditor, setOpenEditor] = useState<"task" | "goal" | "money" | null>(null);
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [pinSetupConfirm, setPinSetupConfirm] = useState("");
  const [pinError, setPinError] = useState(false);
  const [alarmLeadMin, setAlarmLeadMin] = useState("5");

  function focusChild(child: Child | null) {
    setSelectedChildId(child?.id ?? null);
    if (!child) return;
    setChildDraft({ name: child.name, av: child.av, color: child.color, colorLite: child.colorLite });
    setTaskEditor(makeTaskEditor(child.id));
    setGoalEditor(makeGoalEditor(child.id));
  }

  useEffect(() => {
    let alive = true;
    let core: Core | null = null;

    async function boot() {
      try {
        core = await Core.create(
          supabase,
          tenantId,
          () => {
            if (alive) setVersion((value) => value + 1);
          },
          (kind, text) => {
            if (!alive) return;
            setToast({ kind, text });
            window.setTimeout(() => {
              if (alive) setToast(null);
            }, 2600);
          },
        );
        if (!alive) {
          core.destroy();
          return;
        }
        setCore(core);
        const state = core.getState();
        focusChild(state.children[0] ?? null);
        setAlarmLeadMin(String(state.settings.alarmLeadMin ?? 5));
        setLoading(false);
        setVersion((value) => value + 1);
      } catch (error) {
        if (!alive) return;
        setBootError(error instanceof Error ? error.message : "Unable to load family");
        setLoading(false);
      }
    }

    void boot();
    return () => {
      alive = false;
      core?.destroy();
    };
  }, [supabase, tenantId]);
  const state = core?.getState();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading || !state) {
    return (
      <main className="family-shell family-shell--loading">
        <section className="panel panel--hero">
          <div>
            <p className="eyebrow">{familyName}</p>
            <h1>{bootError ? "Could not load the family board" : "Loading the family board..."}</h1>
            <p className="hero-copy">{bootError ?? `Signed in as ${email}`}</p>
            {bootError && (
              <button type="button" onClick={() => window.location.reload()}>
                Try again
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  const selectedChild = state.children.find((child) => child.id === selectedChildId) ?? state.children[0];
  const selectedTasks = selectedChild ? state.tasks.filter((task) => task.childId === selectedChild.id) : [];
  const selectedGoals = selectedChild ? core?.goalsFor(selectedChild.id, "active") ?? [] : [];
  const selectedPending = selectedChild ? core?.pendingToday(selectedChild.id, now) ?? [] : [];
  const selectedSummary = selectedChild ? core?.weeklySummary(selectedChild.id, now) : null;
  const selectedAlarm = selectedChild ? core?.nextAlarm(selectedChild.id, now) : null;

  function beginTaskEdit(task: Task) {
    setTaskEditor({
      id: task.id,
      childId: task.childId,
      icon: task.icon,
      en: task.en,
      af: task.af,
      win: task.win,
      time: task.time ?? "",
      amount: String(task.amount),
      alarm: task.alarm,
      mute: task.mute,
      penalty: String(task.penalty),
      carry: task.carry,
      days: [...task.days],
      active: task.active,
    });
    setParentTab("manage");
    setOpenEditor("task");
  }

  function beginGoalEdit(goal: Goal) {
    setGoalEditor({
      id: goal.id,
      childId: goal.childId,
      icon: goal.icon,
      name: goal.name,
      price: String(goal.price),
      status: goal.status,
      repeatableDaily: goal.repeatableDaily,
    });
    setParentTab("manage");
    setOpenEditor("goal");
  }

  async function saveChild() {
    if (!core || !selectedChild) return;
    await core.updateChild(selectedChild.id, {
      name: childDraft.name,
      av: childDraft.av,
      color: childDraft.color,
      colorLite: childDraft.colorLite,
    });
    setToast({ kind: "info", text: "Child saved" });
  }

  async function addChild() {
    if (!core || !newChild.name.trim()) return;
    const id = await core.addChild(newChild);
    const created = core.getState().children.find((child) => child.id === id) ?? null;
    focusChild(created);
    setNewChild({ name: "", av: "🙂", color: COLOR_CHOICES[2][0], colorLite: COLOR_CHOICES[2][1] });
  }

  async function saveTask() {
    if (!core || !selectedChild) return;
    const payload = {
      icon: taskEditor.icon,
      en: taskEditor.en.trim(),
      af: taskEditor.af.trim(),
      win: taskEditor.win,
      time: taskEditor.time.trim() || null,
      amount: Number(taskEditor.amount) || 0,
      alarm: taskEditor.alarm,
      mute: taskEditor.mute,
      penalty: Number(taskEditor.penalty) || 0,
      carry: taskEditor.carry,
      days: [...taskEditor.days].sort((a, b) => a - b),
      active: taskEditor.active,
    };
    if (taskEditor.id) {
      await core.updateTask(taskEditor.id, payload);
    } else {
      await core.addTask(taskEditor.childId || selectedChild.id, payload);
    }
    setTaskEditor(makeTaskEditor(selectedChild.id));
    setOpenEditor(null);
  }

  async function saveGoal() {
    if (!core || !selectedChild) return;
    const payload = {
      icon: goalEditor.icon,
      name: goalEditor.name.trim(),
      price: Number(goalEditor.price) || 0,
      status: goalEditor.status,
      repeatableDaily: goalEditor.repeatableDaily,
    };
    if (goalEditor.id) {
      await core.updateGoal(goalEditor.id, payload);
    } else {
      await core.addGoal(goalEditor.childId || selectedChild.id, payload);
    }
    setGoalEditor(makeGoalEditor(selectedChild.id));
    setOpenEditor(null);
  }

  async function saveMoney() {
    if (!core || !selectedChild) return;
    const amount = Math.abs(Number(moneyAmount) || 0);
    if (!amount) return;
    const note = moneyNote.trim() || undefined;
    if (moneyAction === "award") await core.adjust(selectedChild.id, amount, note ?? "Special award");
    if (moneyAction === "deduct") await core.adjust(selectedChild.id, -amount, note ?? "Deduction");
    if (moneyAction === "spend") await core.spend(selectedChild.id, amount, note);
    if (moneyAction === "advance") await core.advance(selectedChild.id, amount, note);
    setMoneyAmount("0");
    setMoneyNote("");
    setOpenEditor(null);
  }

  async function saveCopyDay() {
    if (!core || !selectedChild || !copyToDays.length) return;
    await core.copyDay(selectedChild.id, copyFromDay, copyToDays);
  }

  async function saveCloneWeek() {
    if (!core || !selectedChild || !cloneTargetId) return;
    await core.cloneWeek(selectedChild.id, cloneTargetId);
  }

  function requestParentMode() {
    setPinEntry("");
    setPinSetupConfirm("");
    setPinError(false);
    setPinPromptOpen(true);
  }

  async function submitPin() {
    const ok = await verifyPin(pinEntry, tenantId, state?.pinHash ?? null);
    if (!ok) {
      setPinError(true);
      setPinEntry("");
      return;
    }
    setPinPromptOpen(false);
    setMode("parent");
  }

  async function submitPinSetup() {
    if (pinEntry.length !== 4 || pinEntry !== pinSetupConfirm) {
      setPinError(true);
      return;
    }
    await core?.setPin(pinEntry);
    setPinPromptOpen(false);
    setMode("parent");
  }

  const af = state.kidLang === "af";
  const kidLabel = (task: Task) => (af && task.af ? task.af : task.en);

  const hasPin = !!state?.pinHash;

  const pinModal = pinPromptOpen ? (
    <div className="pin-modal" role="dialog" aria-modal="true">
      <div className="panel pin-modal__card">
        {hasPin ? (
          <>
            <h2>{af ? "Ouer-PIN" : "Parent PIN"}</h2>
            <p>{af ? "Sleutel die 4-syfer PIN in." : "Enter the 4-digit PIN to open the parent area."}</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinEntry}
              onChange={(event) => {
                setPinError(false);
                setPinEntry(event.target.value.replace(/\D/g, ""));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && pinEntry.length === 4) void submitPin();
              }}
              placeholder="••••"
            />
            {pinError && <p className="pin-modal__error">{af ? "Verkeerde PIN, probeer weer." : "Wrong PIN, try again."}</p>}
            <div className="btn-row">
              <button className="btn btn--primary" disabled={pinEntry.length !== 4} onClick={() => void submitPin()}>
                {af ? "Oopsluit" : "Unlock"}
              </button>
              <button className="btn btn--ghost" onClick={() => setPinPromptOpen(false)}>
                {af ? "Kanselleer" : "Cancel"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{af ? "Stel 'n ouer-PIN" : "Set a parent PIN"}</h2>
            <p>
              {af
                ? "Daar is nog geen PIN nie. Kies nou een sodat die kinders nie by die ouer-area kan kom nie."
                : "No PIN is set yet. Choose one now so the kids can't reach the parent area."}
            </p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinEntry}
              onChange={(event) => {
                setPinError(false);
                setPinEntry(event.target.value.replace(/\D/g, ""));
              }}
              placeholder={af ? "Nuwe PIN" : "New PIN"}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinSetupConfirm}
              onChange={(event) => {
                setPinError(false);
                setPinSetupConfirm(event.target.value.replace(/\D/g, ""));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitPinSetup();
              }}
              placeholder={af ? "Bevestig PIN" : "Confirm PIN"}
            />
            {pinError && (
              <p className="pin-modal__error">
                {af ? "PIN moet 4 syfers wees en ooreenstem." : "PINs must match and be exactly 4 digits."}
              </p>
            )}
            <div className="btn-row">
              <button className="btn btn--primary" disabled={pinEntry.length !== 4 || pinSetupConfirm.length !== 4} onClick={() => void submitPinSetup()}>
                {af ? "Stoor & oopsluit" : "Save & unlock"}
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setPinPromptOpen(false);
                  setMode("parent");
                }}
              >
                {af ? "Nie nou nie" : "Not now"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  if (mode === "kids") {
    const kidBalance = selectedChild ? core?.balance(selectedChild.id) ?? 0 : 0;
    const kidEarned = selectedChild ? core?.earnedToday(selectedChild.id, now) ?? 0 : 0;
    const kidPossible = selectedChild ? core?.possibleToday(selectedChild.id, now) ?? 0 : 0;
    const goalTotal = selectedGoals.reduce((sum: number, goal: Goal) => sum + goal.price, 0);
    const goalToGo = Math.max(0, goalTotal - kidBalance);
    const piggyPct = goalTotal > 0 ? Math.min(100, Math.round((kidBalance / goalTotal) * 100)) : kidBalance > 0 ? 100 : 0;
    const screen = selectedChild ? core?.screenStatus(selectedChild.id, now) : null;
    const screenPct = screen && screen.totalSec > 0 ? Math.max(0, Math.min(100, Math.round((screen.remainSec / screen.totalSec) * 100))) : 0;
    const screenOut = !!screen && screen.remainSec <= 0;

    return (
      <main className="family-shell">
        <header className="family-hero panel panel--hero panel--hero-slim">
          <div>
            <p className="eyebrow">{familyName}</p>
            <h1>{selectedChild ? `${af ? "Hallo" : "Hi"} ${selectedChild.name}!` : af ? "Hallo!" : "Hi there!"}</h1>
          </div>
          <div className="hero-actions">
            <button className="btn btn--ghost" onClick={requestParentMode}>🔒 {af ? "Ouers" : "Parents"}</button>
          </div>
        </header>

        <section className="panel chip-panel chip-panel--compact">
          <span className="chip-label">{af ? "Kies jou naam" : "Pick your name"}</span>
          <div className="chip-row chip-row--compact">
            {state.children.map((child) => (
              <button
                key={child.id}
                className={`child-chip child-chip--mini ${child.id === selectedChild?.id ? "is-active" : ""}`}
                style={{
                  ["--chip" as string]: child.color,
                  ["--chip-soft" as string]: child.colorLite,
                } as React.CSSProperties}
                onClick={() => focusChild(child)}
              >
                <span className="child-chip__avatar">{child.av}</span>
                <span className="child-chip__stack">
                  <span className="child-chip__name">{child.name}</span>
                  <span className="child-chip__balance">{formatMoney(core?.balance(child.id) ?? 0)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {selectedChild && (
          <section
            className="panel kid-board"
            style={{
              ["--chip" as string]: selectedChild.color,
              ["--chip-soft" as string]: selectedChild.colorLite,
            } as React.CSSProperties}
          >
            <header className="kid-board__head">
              <span className="kid-board__avatar">{selectedChild.av}</span>
              <div>
                <h2>{selectedChild.name}</h2>
                <p>
                  {af ? "Beursie" : "Wallet"}: <strong>{formatMoney(kidBalance)}</strong>
                  {" · "}
                  {af ? "Vandag" : "Today"}: <strong>{formatMoney(kidEarned)}</strong> / {formatMoney(kidPossible)}
                </p>
              </div>
            </header>

            <div className="kid-vitals">
              <div className="kid-vital kid-vital--piggy">
                <div className="piggy" role="img" aria-label={`${piggyPct}%`}>
                  <div className="piggy__fill" style={{ height: `${piggyPct}%` }} />
                  <span className="piggy__emoji">🐷</span>
                </div>
                <div className="kid-vital__body">
                  <h3>{af ? "Spaarvarkie" : "Piggy bank"}</h3>
                  <p className="kid-vital__big">
                    {formatMoney(kidBalance)}
                    {goalTotal > 0 && <span> / {formatMoney(goalTotal)}</span>}
                  </p>
                  <p>
                    {goalTotal > 0
                      ? `${piggyPct}% ${af ? "vol" : "full"}${goalToGo > 0 ? ` · ${af ? "nog" : "still"} ${formatMoney(goalToGo)}` : ""}`
                      : af ? "Geen spaardoel nog nie" : "No savings goal yet"}
                  </p>
                </div>
              </div>

              <div className={`kid-vital kid-vital--timer ${screen?.running ? "is-on" : ""} ${screenOut ? "is-out" : ""}`}>
                <div className="kid-vital__body">
                  <h3>{af ? "Skermtyd oor" : "Screen time left"}</h3>
                  <p className="kid-timer__digits">{screen ? formatDuration(screen.remainSec) : "--:--"}</p>
                  <div className="goal-progress kid-timer__bar">
                    <span className="goal-progress__fill" style={{ width: `${screenPct}%` }} />
                  </div>
                  <p>
                    {screenOut
                      ? af ? "Tyd is op vir vandag!" : "Time's up for today!"
                      : screen?.running
                        ? af ? "Tyd loop nou…" : "Counting down…"
                        : `${af ? "Gebruik" : "Used"} ${formatDuration(screen?.usedSec ?? 0)} / ${formatDuration(screen?.totalSec ?? 0)}`}
                  </p>
                </div>
                {screen?.running ? (
                  <button className="btn btn--ghost kid-timer__btn" onClick={() => void core?.pauseScreen(selectedChild.id, now)}>
                    ⏸ {af ? "Stop" : "Pause"}
                  </button>
                ) : (
                  <button className="btn btn--primary kid-timer__btn" disabled={screenOut} onClick={() => void core?.startScreen(selectedChild.id, now)}>
                    ▶ {af ? "Begin" : "Start"}
                  </button>
                )}
              </div>
            </div>

            <div className="kid-board__section">
              <div className="section-head section-head--tight">
                <h3>{af ? `${selectedChild.name} se takies` : `${selectedChild.name}'s tasks`}</h3>
                <span>{af ? "Elke takie se beloning" : "Each task shows its reward"}</span>
              </div>
              {WINDOWS.map((win) => {
                const tasks = selectedTasks.filter((task) => task.win === win);
                if (!tasks.length) return null;
                return (
                  <section key={win} className="window-block window-block--slim">
                    <div className="window-block__head">
                      <h3>{windowLabel(win)}</h3>
                      <span>
                        {tasks.length} {af ? "takies" : "tasks"} · {formatMoney(tasks.reduce((sum, task) => sum + task.amount, 0))}
                      </span>
                    </div>
                    <div className="task-list">
                      {tasks.map((task) => {
                        const taskState = core?.taskState(task, now) ?? "inactive";
                        const pending = selectedPending.find((item) => item.task?.id === task.id);
                        return (
                          <article key={task.id} className={`task-card task-card--slim task-card--${taskState}`}>
                            <div className="task-card__main">
                              <div className="task-card__icon">{task.icon}</div>
                              <div>
                                <h4>{kidLabel(task)}</h4>
                                {task.time && <p>{task.time}</p>}
                              </div>
                            </div>
                            <div className="task-card__meta">
                              <span className="pill">+{formatMoney(task.amount)}</span>
                            </div>
                            <div className="task-card__actions">
                              {taskState === "available" && (
                                <button className="btn btn--primary" onClick={() => void core?.complete(selectedChild.id, task.id, now)}>
                                  {af ? "Klaar!" : "Done!"}
                                </button>
                              )}
                              {pending && (
                                <button className="btn btn--ghost" onClick={() => void core?.undo(pending.completion.id)}>
                                  {af ? "Oeps" : "Undo"}
                                </button>
                              )}
                              {taskState === "locked" && <span className="task-hint">{af ? "Nog nie" : "Not yet"}</span>}
                              {taskState === "missed" && <span className="task-hint task-hint--bad">{af ? "Gemis" : "Missed"}</span>}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!selectedTasks.length && <p className="empty-state">{af ? "Geen takies vandag nie!" : "No tasks today!"}</p>}
            </div>

            <div className="kid-board__section">
              <div className="section-head section-head--tight">
                <h3>{af ? `${selectedChild.name} spaar vir` : `${selectedChild.name} is saving for`}</h3>
                <span>
                  {selectedGoals.length
                    ? goalToGo > 0
                      ? `${af ? "Nog" : "Still"} ${formatMoney(goalToGo)} ${af ? "kort vir alles" : "to go for everything"}`
                      : af ? "Genoeg vir alles!" : "Enough for everything!"
                    : ""}
                </span>
              </div>
              <div className="goal-list">
                {selectedGoals.length ? (
                  selectedGoals.map((goal: Goal) => {
                    const canRedeem = kidBalance >= goal.price;
                    const redeemedToday = core?.isGoalRedeemedToday(selectedChild.id, goal.id, now) ?? false;
                    const progress = goal.price > 0 ? Math.min(100, Math.round((kidBalance / goal.price) * 100)) : 100;
                    return (
                      <article key={goal.id} className={`goal-card goal-card--progress ${canRedeem ? "goal-card--ready" : ""}`}>
                        <div className="goal-card__icon">{goal.icon}</div>
                        <div className="goal-card__body">
                          <h3>{goal.name}</h3>
                          <div className="goal-progress">
                            <span className="goal-progress__fill" style={{ width: `${progress}%` }} />
                          </div>
                          <p>
                            {canRedeem
                              ? af ? "Gereed om te kry!" : "Ready to redeem!"
                              : `${formatMoney(kidBalance)} / ${formatMoney(goal.price)} · ${af ? "nog" : "still"} ${formatMoney(goal.price - kidBalance)}`}
                          </p>
                          {redeemedToday && <span className="task-hint">{af ? "Reeds gekry vandag" : "Already claimed today"}</span>}
                        </div>
                        <button className="btn btn--primary" disabled={!canRedeem} onClick={() => void core?.redeemGoal(selectedChild.id, goal.id, now)}>
                          {af ? "Kry dit!" : "Redeem"}
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <p className="empty-state">{af ? "Geen belonings nog nie." : "No active goals."}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {pinModal}
        {toast && <div className={`toast toast--${toast.kind}`}>{toast.text}</div>}
      </main>
    );
  }

  return (
    <main className="family-shell">
      <header className="family-hero panel panel--hero">
        <div>
          <p className="eyebrow">{familyName}</p>
          <h1>Chores, rewards, and routines in one board.</h1>
          <p className="hero-copy">Signed in as {email}</p>
        </div>
        <div className="hero-actions">
          <button className="btn btn--primary" onClick={() => setMode("kids")}>Kids&apos; view</button>
          <a className="btn btn--ghost" href="/auth/signout">Sign out</a>
        </div>
      </header>

      <nav className="panel tab-bar">
        {PARENT_TABS.map((tab) => (
          <button key={tab.id} className={parentTab === tab.id ? "is-active" : ""} onClick={() => setParentTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="panel chip-panel chip-panel--compact">
        <div className="section-head section-head--tight">
          <h2>Children</h2>
          <span>{state.children.length} profiles</span>
        </div>
        <div className="chip-row chip-row--compact">
          {state.children.map((child) => (
            <button
              key={child.id}
              className={`child-chip child-chip--mini ${child.id === selectedChild?.id ? "is-active" : ""}`}
              style={{
                ["--chip" as string]: child.color,
                ["--chip-soft" as string]: child.colorLite,
              } as React.CSSProperties}
              onClick={() => focusChild(child)}
            >
              <span className="child-chip__avatar">{child.av}</span>
              <span className="child-chip__stack">
                <span className="child-chip__name">{child.name}</span>
                <span className="child-chip__balance">{formatMoney(core?.balance(child.id) ?? 0)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {parentTab === "board" && (
      <section className="stats-grid">
        <article className="panel stat-card">
          <span className="eyebrow">Wallet</span>
          <strong>{selectedChild ? formatMoney(core?.balance(selectedChild.id) ?? 0) : "R0"}</strong>
          <p>{selectedChild?.name ?? "No child selected"}</p>
        </article>
        <article className="panel stat-card">
          <span className="eyebrow">Today earned</span>
          <strong>{selectedChild ? formatMoney(core?.earnedToday(selectedChild.id, now) ?? 0) : "R0"}</strong>
          <p>Possible: {selectedChild ? formatMoney(core?.possibleToday(selectedChild.id, now) ?? 0) : "R0"}</p>
        </article>
        <article className="panel stat-card">
          <span className="eyebrow">Next alarm</span>
          <strong>{selectedAlarm ? selectedAlarm.task.en : "None"}</strong>
          <p>{selectedAlarm ? `${Math.max(0, selectedAlarm.secsToGo)}s ${selectedAlarm.phase}` : "No timed task due"}</p>
        </article>

        <article className="panel stat-card">
          <span className="eyebrow">Alarm action</span>
          <strong>{selectedAlarm ? selectedAlarm.task.time ?? "Timed" : "Idle"}</strong>
          <p>{selectedAlarm ? `Snoozed: ${selectedAlarm.snoozed ? "yes" : "no"}` : "No alarm pending"}</p>
          {selectedAlarm && (
            <button className="btn btn--ghost" onClick={() => void core?.snooze(selectedChild.id, selectedAlarm.task.id, now)}>
              Snooze {selectedAlarm.snoozeMin} min
            </button>
          )}
        </article>
      </section>
      )}

      <section className={parentTab === "board" ? "board-grid" : "board-solo"}>
        {parentTab === "board" && (
        <div className="panel board-column">
          <div className="section-head">
            <h2>Today</h2>
            <span>{selectedChild?.name}</span>
          </div>
          {WINDOWS.map((win) => {
            const tasks = selectedTasks.filter((task) => task.win === win);
            if (!tasks.length) return null;
            return (
              <section key={win} className="window-block">
                <div className="window-block__head">
                  <h3>{windowLabel(win)}</h3>
                  <span>{tasks.length} tasks</span>
                </div>
                <div className="task-list">
                  {tasks.map((task) => {
                    const taskState = core?.taskState(task, now) ?? "inactive";
                    const pending = selectedPending.find((item) => item.task?.id === task.id);
                    return (
                      <article key={task.id} className={`task-card task-card--${taskState}`}>
                        <div className="task-card__main">
                          <div className="task-card__icon">{task.icon}</div>
                          <div>
                            <h4>{task.en}</h4>
                            <p>
                              {task.af}
                              {task.time ? ` • ${task.time}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="task-card__meta">
                          <span className="pill">R{task.amount}</span>
                          <span className="pill pill--soft">{taskState}</span>
                        </div>
                        <div className="task-card__actions">
                          {taskState === "available" && (
                            <button className="btn btn--primary" onClick={() => void core?.complete(selectedChild.id, task.id, now)}>Done</button>
                          )}
                          {pending && (
                            <button className="btn btn--ghost" onClick={() => void core?.undo(pending.completion.id)}>Undo</button>
                          )}
                          {taskState === "locked" && <span className="task-hint">Not yet</span>}
                          {taskState === "missed" && <span className="task-hint task-hint--bad">Missed</span>}
                          <button className="btn btn--ghost" onClick={() => beginTaskEdit(task)}>Edit</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="window-block">
            <div className="window-block__head">
              <h3>Completed today</h3>
              <span>{selectedPending.length} entries</span>
            </div>
            <div className="pending-list">
              {selectedPending.length ? (
                selectedPending.map(({ completion, task }) => (
                  <article key={completion.id} className="pending-row">
                    <div>
                      <strong>{task?.en ?? "Task"}</strong>
                      <p>{completion.manual ? "Given manually" : `Done ${formatClock(completion.ts)}`}</p>
                    </div>
                    <span className="pill">+R{completion.amount}</span>
                    <button className="btn btn--ghost" onClick={() => void core?.dispute(completion.id, now)}>Dispute</button>
                  </article>
                ))
              ) : (
                <p className="empty-state">Nothing completed yet.</p>
              )}
            </div>
          </section>
        </div>
        )}

        <aside className="panel side-column">
          {parentTab === "board" && (
          <section>
            <div className="section-head">
              <h2>Rewards</h2>
              <span>{selectedGoals.length} active</span>
            </div>
            <div className="goal-list">
              {selectedGoals.length ? (
                selectedGoals.map((goal: Goal) => {
                  const balance = selectedChild ? core?.balance(selectedChild.id) ?? 0 : 0;
                  const canRedeem = selectedChild ? balance >= goal.price : false;
                  const redeemedToday = selectedChild ? core?.isGoalRedeemedToday(selectedChild.id, goal.id, now) : false;
                  return (
                    <article key={goal.id} className={`goal-card ${canRedeem ? "goal-card--ready" : ""}`}>
                      <div className="goal-card__icon">{goal.icon}</div>
                      <div className="goal-card__body">
                        <h3>{goal.name}</h3>
                        <p>R{goal.price}</p>
                        {redeemedToday && <span className="task-hint">Already claimed today</span>}
                      </div>
                      <button className="btn btn--primary" disabled={!canRedeem} onClick={() => void core?.redeemGoal(selectedChild.id, goal.id, now)}>
                        Redeem
                      </button>
                      <button className="btn btn--ghost" onClick={() => beginGoalEdit(goal)}>Edit</button>
                    </article>
                  );
                })
              ) : (
                <p className="empty-state">No active goals.</p>
              )}
            </div>
          </section>
          )}

          {parentTab === "board" && (
          <section>
            <div className="section-head">
              <h2>This week</h2>
              <span>Summary</span>
            </div>
            <div className="summary-grid">
              <div><strong>{selectedSummary?.done ?? 0}</strong><span>done</span></div>
              <div><strong>{selectedSummary?.scheduled ?? 0}</strong><span>scheduled</span></div>
              <div><strong>{selectedSummary?.missed ?? 0}</strong><span>missed</span></div>
              <div><strong>{formatMoney(selectedSummary?.earned ?? 0)}</strong><span>earned</span></div>
            </div>
          </section>
          )}

          {parentTab === "settings" && (
          <section>
            <div className="section-head">
              <h2>Settings</h2>
              <span>Parent tools</span>
            </div>
            <div className="setting-stack">
              <div className="setting-row">
                <div>
                  <strong>Kid language</strong>
                  <p>What the children see on the board</p>
                </div>
                <div className="segmented">
                  <button className={state.kidLang === "af" ? "is-active" : ""} onClick={() => void core?.setKidLang("af")}>AF</button>
                  <button className={state.kidLang === "en" ? "is-active" : ""} onClick={() => void core?.setKidLang("en")}>EN</button>
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <strong>Screen time budget per child</strong>
                  <p>Daily minutes each child may use. The +/− buttons add or remove extra time for today only.</p>
                </div>
              </div>
              {state.children.map((child) => {
                const status = core?.screenStatus(child.id, now);
                return (
                  <div key={child.id} className="screen-alarm-row">
                    <span className="screen-alarm-row__name">{child.av} {child.name}</span>
                    <label className="field">
                      <span>Minutes per day</span>
                      <input
                        type="number"
                        min={0}
                        value={child.screenDailyMin}
                        onChange={(event) => void core?.updateChild(child.id, { screenDailyMin: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </label>
                    <div className="field">
                      <span>Today: {formatDuration(status?.remainSec ?? 0)} left</span>
                      <div className="btn-row">
                        <button className="btn btn--ghost" onClick={() => void core?.adjustScreen(child.id, 15, now)}>+15m</button>
                        <button className="btn btn--ghost" onClick={() => void core?.adjustScreen(child.id, -15, now)}>−15m</button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <label className="field">
                <span>Alarm lead minutes</span>
                <input value={alarmLeadMin} onChange={(event) => setAlarmLeadMin(event.target.value)} onBlur={() => void core?.updateSettings({ alarmLeadMin: Number(alarmLeadMin) || 5 })} inputMode="numeric" />
              </label>

              <label className="setting-row setting-row--switch">
                <div>
                  <strong>Weekly summary</strong>
                  <p>Show the weekly progress block</p>
                </div>
                <button className={`switch ${state.settings.weeklySummary ? "is-on" : ""}`} onClick={() => void core?.updateSettings({ weeklySummary: !state.settings.weeklySummary })} />
              </label>

              <label className="field">
                <span>Change PIN</span>
                <div className="pin-row">
                  <input value={pinValue} onChange={(event) => setPinValue(event.target.value)} inputMode="numeric" maxLength={4} placeholder="1234" />
                  <button className="btn btn--primary" onClick={() => void core?.setPin(pinValue)}>Save</button>
                </div>
              </label>
            </div>
          </section>
          )}

          {parentTab === "settings" && (
          <section>
            <div className="section-head">
              <h2>Add a child</h2>
              <span>New family profile</span>
            </div>
            <div className="setting-stack">
              <label className="field">
                <span>Name</span>
                <input value={newChild.name} onChange={(event) => setNewChild((draft) => ({ ...draft, name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Avatar</span>
                <div className="chip-row chip-row--tight">
                  {AVATAR_CHOICES.map((avatar) => (
                    <button key={avatar} className={`child-chip ${newChild.av === avatar ? "is-active" : ""}`} onClick={() => setNewChild((draft) => ({ ...draft, av: avatar }))} type="button">
                      <span className="child-chip__avatar">{avatar}</span>
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                <span>Colour</span>
                <div className="chip-row chip-row--tight">
                  {COLOR_CHOICES.map(([color, soft]) => (
                    <button key={color} className={`child-chip ${newChild.color === color ? "is-active" : ""}`} style={{ ["--chip" as string]: color, ["--chip-soft" as string]: soft } as React.CSSProperties} onClick={() => setNewChild((draft) => ({ ...draft, color, colorLite: soft }))} type="button">
                      <span className="child-chip__avatar" style={{ background: soft }}>•</span>
                    </button>
                  ))}
                </div>
              </label>
              <div className="btn-row">
                <button className="btn btn--primary" onClick={() => void addChild()}>Add child</button>
              </div>
            </div>
          </section>
          )}

          {parentTab === "settings" && (
          <section>
            <div className="section-head">
              <h2>Ledger</h2>
              <span>Recent activity</span>
            </div>
            <div className="ledger-list">
              {state.ledger.slice(0, 8).map((entry) => (
                <article key={entry.id} className="ledger-row">
                  <div>
                    <strong>{entry.type}</strong>
                    <p>{entry.note || formatClock(entry.ts)}</p>
                  </div>
                  <span className={entry.amount < 0 ? "is-negative" : "is-positive"}>{entry.amount < 0 ? `-R${Math.abs(entry.amount)}` : `+R${entry.amount}`}</span>
                </article>
              ))}
              {!state.ledger.length && <p className="empty-state">No transactions yet.</p>}
            </div>
          </section>
          )}

          {parentTab === "manage" && (
          <section>
            <div className="section-head">
              <h2>Manage {selectedChild?.name ?? "—"}</h2>
              <span>Tasks, goals, awards & deductions</span>
            </div>

            <div className="setting-stack">
              <div className="setting-row">
                <div>
                  <strong>Child profile</strong>
                  <p>Name, avatar and colour. Adding a child moved to Settings.</p>
                </div>
              </div>

              <div className="setting-stack">
                <label className="field">
                  <span>Name</span>
                  <input value={childDraft.name} onChange={(event) => setChildDraft((draft) => ({ ...draft, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Avatar</span>
                  <div className="chip-row chip-row--tight">
                    {AVATAR_CHOICES.map((avatar) => (
                      <button key={avatar} className={`child-chip ${childDraft.av === avatar ? "is-active" : ""}`} onClick={() => setChildDraft((draft) => ({ ...draft, av: avatar }))} type="button">
                        <span className="child-chip__avatar">{avatar}</span>
                      </button>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>Colour</span>
                  <div className="chip-row chip-row--tight">
                    {COLOR_CHOICES.map(([color, soft]) => (
                      <button key={color} className={`child-chip ${childDraft.color === color ? "is-active" : ""}`} style={{ ["--chip" as string]: color, ["--chip-soft" as string]: soft } as React.CSSProperties} onClick={() => setChildDraft((draft) => ({ ...draft, color, colorLite: soft }))} type="button">
                        <span className="child-chip__avatar" style={{ background: soft }}>•</span>
                      </button>
                    ))}
                  </div>
                </label>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={() => void saveChild()}>Save child</button>
                  {selectedChild && <button className="btn btn--ghost" onClick={() => void core?.removeChild(selectedChild.id)}>Delete child</button>}
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <strong>{taskEditor.id ? "Edit task" : "Tasks"}</strong>
                  <p>{selectedChild ? `Chores and routines for ${selectedChild.name}` : "Choose a child first"}</p>
                </div>
                <button
                  className={openEditor === "task" ? "btn btn--ghost" : "btn btn--primary"}
                  onClick={() => {
                    if (openEditor === "task") {
                      setOpenEditor(null);
                    } else {
                      setTaskEditor(makeTaskEditor(selectedChild?.id ?? ""));
                      setOpenEditor("task");
                    }
                  }}
                >
                  {openEditor === "task" ? "Close" : "+ Add task"}
                </button>
              </div>
              {openEditor === "task" && (
              <div className="setting-stack">
                <label className="field">
                  <span>Title</span>
                  <input value={taskEditor.en} onChange={(event) => setTaskEditor((draft) => ({ ...draft, en: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Afrikaans</span>
                  <input value={taskEditor.af} onChange={(event) => setTaskEditor((draft) => ({ ...draft, af: event.target.value }))} />
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>Amount</span>
                    <input value={taskEditor.amount} onChange={(event) => setTaskEditor((draft) => ({ ...draft, amount: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label className="field">
                    <span>Time</span>
                    <input value={taskEditor.time} onChange={(event) => setTaskEditor((draft) => ({ ...draft, time: event.target.value }))} placeholder="16:00" />
                  </label>
                </div>
                <label className="field">
                  <span>Window</span>
                  <div className="segmented">
                    {WINDOWS.map((win) => (
                      <button key={win} type="button" className={taskEditor.win === win ? "is-active" : ""} onClick={() => setTaskEditor((draft) => ({ ...draft, win }))}>{win}</button>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>Days</span>
                  <div className="chip-row chip-row--tight">
                    {DAY_LABELS.map((label, index) => (
                      <button key={label} type="button" className={`day-chip ${taskEditor.days.includes(index) ? "is-active" : ""}`} onClick={() => setTaskEditor((draft) => ({ ...draft, days: draft.days.includes(index) ? draft.days.filter((day) => day !== index) : [...draft.days, index] }))}>
                        {label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>Carry</span>
                  <div className="segmented">
                    {(["none", "later", "next"] as const).map((value) => (
                      <button key={value} type="button" className={taskEditor.carry === value ? "is-active" : ""} onClick={() => setTaskEditor((draft) => ({ ...draft, carry: value }))}>
                        {value}
                      </button>
                    ))}
                  </div>
                </label>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={() => void saveTask()}>{taskEditor.id ? "Save task" : "Add task"}</button>
                  {taskEditor.id && <button className="btn btn--ghost" onClick={() => void core?.removeTask(taskEditor.id!)}>Delete task</button>}
                </div>
              </div>
              )}

              <div className="setting-row">
                <div>
                  <strong>{goalEditor.id ? "Edit savings goal" : "Savings goals"}</strong>
                  <p>{selectedChild ? `What ${selectedChild.name} is saving towards` : "Choose a child first"}</p>
                </div>
                <button
                  className={openEditor === "goal" ? "btn btn--ghost" : "btn btn--primary"}
                  onClick={() => {
                    if (openEditor === "goal") {
                      setOpenEditor(null);
                    } else {
                      setGoalEditor(makeGoalEditor(selectedChild?.id ?? ""));
                      setOpenEditor("goal");
                    }
                  }}
                >
                  {openEditor === "goal" ? "Close" : "+ Add goal"}
                </button>
              </div>
              {openEditor === "goal" && (
              <div className="setting-stack">
                <label className="field">
                  <span>Name</span>
                  <input value={goalEditor.name} onChange={(event) => setGoalEditor((draft) => ({ ...draft, name: event.target.value }))} />
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>Price</span>
                    <input value={goalEditor.price} onChange={(event) => setGoalEditor((draft) => ({ ...draft, price: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <div className="segmented">
                      {(["active", "wishlist"] as const).map((status) => (
                        <button key={status} type="button" className={goalEditor.status === status ? "is-active" : ""} onClick={() => setGoalEditor((draft) => ({ ...draft, status }))}>
                          {status}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
                <label className="field">
                  <span>Repeatable daily</span>
                  <button type="button" className={`switch ${goalEditor.repeatableDaily ? "is-on" : ""}`} onClick={() => setGoalEditor((draft) => ({ ...draft, repeatableDaily: !draft.repeatableDaily }))} />
                </label>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={() => void saveGoal()}>{goalEditor.id ? "Save goal" : "Add goal"}</button>
                  {goalEditor.id && <button className="btn btn--ghost" onClick={() => void core?.deleteGoal(goalEditor.id!)}>Delete goal</button>}
                </div>
              </div>
              )}

              <div className="setting-row">
                <div>
                  <strong>Awards & deductions</strong>
                  <p>
                    {selectedChild ? `${selectedChild.name}'s wallet: ${formatMoney(core?.balance(selectedChild.id) ?? 0)}` : "Choose a child first"}
                  </p>
                </div>
                <button
                  className={openEditor === "money" ? "btn btn--ghost" : "btn btn--primary"}
                  onClick={() => setOpenEditor(openEditor === "money" ? null : "money")}
                >
                  {openEditor === "money" ? "Close" : "Adjust balance"}
                </button>
              </div>
              {openEditor === "money" && (
              <div className="setting-stack">
                <div className="segmented">
                  {MONEY_ACTIONS.map((action) => (
                    <button key={action.id} type="button" className={moneyAction === action.id ? "is-active" : ""} onClick={() => setMoneyAction(action.id)}>
                      {action.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">{MONEY_ACTIONS.find((action) => action.id === moneyAction)?.hint}</p>
                <div className="field-grid">
                  <label className="field">
                    <span>Amount</span>
                    <input value={moneyAmount} onChange={(event) => setMoneyAmount(event.target.value)} inputMode="numeric" />
                  </label>
                  <label className="field">
                    <span>Reason</span>
                    <input value={moneyNote} onChange={(event) => setMoneyNote(event.target.value)} placeholder="e.g. Helped wash the car" />
                  </label>
                </div>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={() => void saveMoney()}>
                    Apply {MONEY_ACTIONS.find((action) => action.id === moneyAction)?.label.toLowerCase()}
                  </button>
                </div>
              </div>
              )}

              <div className="setting-row">
                <div>
                  <strong>Recent activity</strong>
                  <p>{selectedChild ? `Last money movements for ${selectedChild.name}` : "Choose a child first"}</p>
                </div>
              </div>
              <div className="ledger-list">
                {selectedChild &&
                  state.ledger
                    .filter((entry) => entry.childId === selectedChild.id)
                    .slice(0, 6)
                    .map((entry) => (
                      <article key={entry.id} className="ledger-row">
                        <div>
                          <strong>{entry.type}</strong>
                          <p>{entry.note || formatClock(entry.ts)}</p>
                        </div>
                        <span className={entry.amount < 0 ? "is-negative" : "is-positive"}>{entry.amount < 0 ? `-R${Math.abs(entry.amount)}` : `+R${entry.amount}`}</span>
                      </article>
                    ))}
                {selectedChild && !state.ledger.some((entry) => entry.childId === selectedChild.id) && (
                  <p className="empty-state">No money movements yet.</p>
                )}
              </div>

              <div className="setting-row">
                <div>
                  <strong>Copy a day</strong>
                  <p>Mirror one weekday onto the others.</p>
                </div>
              </div>
              <div className="setting-stack">
                <label className="field">
                  <span>Copy from</span>
                  <div className="segmented">
                    {DAY_LABELS.map((label, index) => (
                      <button key={label} type="button" className={copyFromDay === index ? "is-active" : ""} onClick={() => setCopyFromDay(index)}>{label}</button>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>Copy to</span>
                  <div className="chip-row chip-row--tight">
                    {DAY_LABELS.map((label, index) => (
                      <button key={label} type="button" className={`day-chip ${copyToDays.includes(index) ? "is-active" : ""}`} onClick={() => setCopyToDays((days) => days.includes(index) ? days.filter((day) => day !== index) : [...days, index])}>
                        {label}
                      </button>
                    ))}
                  </div>
                </label>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={() => void saveCopyDay()}>Copy</button>
                </div>
              </div>

              <div className="setting-row">
                <div>
                  <strong>Clone week</strong>
                  <p>Replace another child&apos;s tasks with this child&apos;s week.</p>
                </div>
              </div>
              <div className="setting-stack">
                <label className="field">
                  <span>Target child</span>
                  <select value={cloneTargetId} onChange={(event) => setCloneTargetId(event.target.value)}>
                    <option value="">Choose child</option>
                    {state.children.filter((child) => child.id !== selectedChild?.id).map((child) => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                  </select>
                </label>
                <div className="btn-row">
                  <button className="btn btn--primary" onClick={() => void saveCloneWeek()}>Clone</button>
                </div>
              </div>
            </div>
          </section>
          )}
        </aside>
      </section>

      {toast && <div className={`toast toast--${toast.kind}`}>{toast.text}</div>}
    </main>
  );
}