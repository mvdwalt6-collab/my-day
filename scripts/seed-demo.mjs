// Seeds demo tasks, goals, and a welcome bonus for every child that has no tasks yet.
// Usage: node --env-file=.env.local scripts/seed-demo.mjs

import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DEMO_TASKS = [
  { icon: "🛏", en: "Make your bed", af: "Maak jou bed op", win: "Morning", time: "07:00", amount: 2 },
  { icon: "🦷", en: "Brush your teeth", af: "Borsel jou tande", win: "Morning", time: "07:15", amount: 1 },
  { icon: "🎒", en: "Unpack school bag", af: "Pak skoolsak uit", win: "Afternoon", time: "14:30", amount: 2 },
  { icon: "🍽", en: "Help set the table", af: "Help dek die tafel", win: "Evening", time: "17:30", amount: 3 },
  { icon: "🧸", en: "Tidy your room", af: "Maak jou kamer aan die kant", win: "Evening", time: "18:30", amount: 3 },
  { icon: "🐶", en: "Feed the pet", af: "Voer die troeteldier", win: "Bonus", time: null, amount: 2 },
];

const DEMO_GOALS = [
  { icon: "🍦", name: "Ice cream treat", price: 25, status: "active", repeatable_daily: false },
  { icon: "🎬", name: "Movie night pick", price: 40, status: "active", repeatable_daily: false },
  { icon: "🧸", name: "New toy", price: 120, status: "active", repeatable_daily: false },
];

const { data: children, error: childError } = await admin
  .from("children")
  .select("id, tenant_id, name, balance");

if (childError) {
  console.error(`Failed to list children: ${childError.message}`);
  process.exit(1);
}

if (!children?.length) {
  console.log("No children found — nothing to seed.");
  process.exit(0);
}

for (const child of children) {
  const notes = [];

  const { count: taskCount } = await admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("child_id", child.id);

  if ((taskCount ?? 0) === 0) {
    const { error: taskError } = await admin.from("tasks").insert(
      DEMO_TASKS.map((task) => ({
        tenant_id: child.tenant_id,
        child_id: child.id,
        ...task,
        alarm: true,
        mute: false,
        penalty: 0,
        carry: "none",
        days: ALL_DAYS,
        active: true,
      })),
    );
    notes.push(taskError ? `tasks FAILED (${taskError.message})` : `${DEMO_TASKS.length} tasks`);
  } else {
    notes.push(`kept ${taskCount} existing tasks`);
  }

  const { count: goalCount } = await admin
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("child_id", child.id);

  if ((goalCount ?? 0) === 0) {
    const { error: goalError } = await admin.from("goals").insert(
      DEMO_GOALS.map((goal) => ({ tenant_id: child.tenant_id, child_id: child.id, ...goal })),
    );
    notes.push(goalError ? `goals FAILED (${goalError.message})` : `${DEMO_GOALS.length} goals`);
  } else {
    notes.push(`kept ${goalCount} existing goals`);
  }

  const { count: bonusCount } = await admin
    .from("ledger")
    .select("id", { count: "exact", head: true })
    .eq("child_id", child.id)
    .eq("note", "Welcome bonus");

  if ((bonusCount ?? 0) === 0) {
    const { error: ledgerError } = await admin.from("ledger").insert({
      tenant_id: child.tenant_id,
      child_id: child.id,
      ts: new Date().toISOString(),
      type: "adjust",
      amount: 10,
      note: "Welcome bonus",
    });
    if (!ledgerError) {
      await admin.from("children").update({ balance: (child.balance ?? 0) + 10 }).eq("id", child.id);
      notes.push("R10 welcome bonus");
    } else {
      notes.push(`bonus FAILED (${ledgerError.message})`);
    }
  } else {
    notes.push("bonus already given");
  }

  console.log(`- ${child.name}: ${notes.join(", ")}.`);
}

console.log("Demo seed complete.");
