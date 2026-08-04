// Legacy-shaped types the vanilla-JS UI expects.
// These match the myday.v1 localStorage blob one-for-one so app.js can consume
// state produced by the Supabase adapter without changes.

export type Lang = "en" | "af";
export type Window = "Morning" | "Afternoon" | "Evening" | "Bonus";
export type Carry = "none" | "next" | "later";
export type GoalStatus = "active" | "wishlist";
export type CompletionStatus = "done" | "disputed";
export type LedgerType = "earn" | "bonus" | "spend" | "advance" | "adjust" | "penalty" | "undo" | "dispute";
export type TaskState = "inactive" | "done" | "locked" | "available" | "missed";
export type MemberRole = "owner" | "parent";
export type TenantStatus = "active" | "suspended" | "deleted";

export interface Settings {
  dayStart: number;
  weeklySummary: boolean;
  holdMs: number;
  alarmLeadMin: number;
  alarmRingSec: number;
  alarmVisibleSec: number;
  snoozeMin: number;
  screenTimeStart: string;
  screenTimeEnd: string;
  weatherEnabled: boolean;
}

export interface Child {
  id: string;
  name: string;
  av: string;
  color: string;
  colorLite: string;
  balance: number;
}

export interface Task {
  id: string;
  childId: string;
  icon: string;
  en: string;
  af: string;
  win: Window;
  time: string | null;
  amount: number;
  alarm: boolean;
  mute: boolean;
  penalty: number;
  carry: Carry;
  days: number[];
  active: boolean;
}

export interface Goal {
  id: string;
  childId: string;
  icon: string;
  name: string;
  price: number;
  status: GoalStatus;
  repeatableDaily: boolean;
}

export interface Completion {
  id: string;
  childId: string;
  taskId: string;
  date: string;
  ts: number;
  amount: number;
  status: CompletionStatus;
  manual: boolean;
}

export interface LedgerEntry {
  id: string;
  childId: string;
  ts: number;
  type: LedgerType;
  amount: number;
  note: string;
}

export interface State {
  tenantId: string;
  familyName: string;
  tenantStatus: TenantStatus;
  role: MemberRole;
  kidLang: Lang;
  pinHash: string | null;
  settings: Settings;
  children: Child[];
  tasks: Task[];
  goals: Goal[];
  completions: Completion[];
  ledger: LedgerEntry[];
  applied: Record<string, boolean>;
  snoozes: Record<string, number>;
}

export interface NextAlarm {
  task: Task;
  at: number;
  secs: number;
  phase: "idle" | "soon" | "ring" | "due";
  secsToGo: number;
  snoozeMin: number;
  snoozed: boolean;
}

export interface Result<T = Record<string, never>> {
  ok: boolean;
  reason?: string;
  coins?: number;
  mins?: number;
  data?: T;
}
