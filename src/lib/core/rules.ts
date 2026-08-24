// Pure date/time + rule helpers, ported 1:1 from legacy/core.js.
// No state, no side effects — safe to call from anywhere.

import type { Completion, State, Task, TaskState, Window } from "./types";

export const WIN: Record<Window, [number, number]> = {
  Morning: [5, 12],
  Afternoon: [12, 17],
  Evening: [17, 20.5],
  Bonus: [5, 24],
};

const pad = (n: number) => (n < 10 ? "0" : "") + n;

export function logicalDateObj(at: Date | number | string): Date {
  const d = new Date(at);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return d;
}

export function dateKey(at: Date | number | string): string {
  const d = logicalDateObj(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dow(at: Date | number | string): number {
  return (logicalDateObj(at).getDay() + 6) % 7;
}

export function nowHour(at: Date | number | string): number {
  const d = new Date(at);
  return d.getHours() + d.getMinutes() / 60;
}

export function parseHour(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":");
  return parseInt(h, 10) + parseInt(m || "0", 10) / 60;
}

export function isCompleted(state: State, childId: string, taskId: string, date: string): boolean {
  return state.completions.some(
    (c) => c.childId === childId && c.taskId === taskId && c.date === date && c.status === "done",
  );
}

export function taskState(state: State, task: Task, at: Date | number | string): TaskState {
  if (!task.active) return "inactive";
  const d = dow(at);
  if (task.days.indexOf(d) < 0) return "inactive";
  const key = dateKey(at);
  if (isCompleted(state, task.childId, task.id, key)) return "done";
  const win = WIN[task.win] ?? WIN.Morning;
  const start = parseHour(task.time) ?? win[0];
  const end = win[1];
  const h = nowHour(at);
  if (h < start) return "locked";
  if (h >= end) return "missed";
  return "available";
}

export function countMissedDaysInWeek(dates: string[], predicate: (dateKey: string) => number): number {
  return dates.reduce((acc, d) => acc + predicate(d), 0);
}

export function weekDates(at: Date | number | string): string[] {
  const start = logicalDateObj(at);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

export function tsInDates(ts: number, dates: string[]): boolean {
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return dates.includes(key);
}

export function completionsToday(state: State, childId: string, at: Date | number | string): Completion[] {
  const key = dateKey(at);
  return state.completions.filter(
    (c) => c.childId === childId && c.date === key && c.status === "done",
  );
}
