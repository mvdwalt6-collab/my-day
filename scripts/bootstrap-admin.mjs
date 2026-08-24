// Creates or updates a confirmed sysadmin user for this project.
// Usage:
//   node --env-file=.env.local scripts/bootstrap-admin.mjs
//   node --env-file=.env.local scripts/bootstrap-admin.mjs admin@example.com
//   node --env-file=.env.local scripts/bootstrap-admin.mjs admin@example.com "StrongPassword123!"

import crypto from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

const email = (emailArg || process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@myday.local").trim().toLowerCase();
const password = (passwordArg || process.env.BOOTSTRAP_ADMIN_PASSWORD || generatePassword()).trim();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

if (!email.includes("@")) {
  console.error("Admin email must be a valid email address.");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Admin password must be at least 8 characters.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { userId, created } = await ensureAdminAuthUser(admin, email, password);

const { error: profileError } = await admin.from("profiles").upsert(
  {
    user_id: userId,
    display_name: "System Admin",
    is_sysadmin: true,
  },
  { onConflict: "user_id" },
);

if (profileError) {
  console.error(`Failed to upsert profile: ${profileError.message}`);
  process.exit(1);
}

console.log("Sysadmin bootstrap completed.");
console.log(`Email: ${email}`);
console.log(`Password: ${password}`);
console.log(`Auth user: ${created ? "created" : "updated"}`);

async function ensureAdminAuthUser(client, userEmail, userPassword) {
  const existing = await findUserByEmail(client, userEmail);
  if (existing) {
    const { error } = await client.auth.admin.updateUserById(existing.id, {
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        display_name: "System Admin",
      },
    });
    if (error) {
      console.error(`Failed to update existing auth user: ${error.message}`);
      process.exit(1);
    }
    return { userId: existing.id, created: false };
  }

  const { data, error } = await client.auth.admin.createUser({
    email: userEmail,
    password: userPassword,
    email_confirm: true,
    user_metadata: {
      display_name: "System Admin",
    },
  });

  if (error || !data.user) {
    console.error(`Failed to create auth user: ${error?.message ?? "unknown error"}`);
    process.exit(1);
  }

  return { userId: data.user.id, created: true };
}

async function findUserByEmail(client, userEmail) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(`Failed to list users: ${error.message}`);
      process.exit(1);
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email || "").toLowerCase() === userEmail);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

function generatePassword() {
  return `Adm!${crypto.randomBytes(12).toString("base64url")}`;
}