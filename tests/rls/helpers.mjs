// Test harness for AriseHub's access model.
//
// These tests run against the REAL database, because that is the only place the
// policies exist — they are not in the app, and reading the migration files
// tells you what someone intended, not what is live. Several bugs found on
// 2026-08-08 were invisible from the code and only appeared when a query ran as
// the role that does the work.
//
// Nothing is ever written. The whole suite runs inside one transaction that is
// always rolled back, and each assertion is wrapped in a SAVEPOINT so an RLS
// denial (which raises, and would otherwise abort the transaction) doesn't
// poison every test after it.

import fs from "node:fs";
import pg from "pg";

const REF = "luzmqpfsylpqxbwzyjcz";
const POOLER = "aws-1-us-west-2.pooler.supabase.com";
const PW_FILE = new URL("../../.supabase-db-password", import.meta.url);

/** Roles the app defines, plus two fixture personas the policies care about. */
export const ROLES = ["Member", "Volunteer", "Staff", "IT_Admin", "Super_Admin"];
export const PERSONAS = [...ROLES, "Lead", "Elder"];

/** Deterministic uuids so failures name a fixture rather than a random id. */
export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * Connection details, or null when unavailable — the suite skips rather than
 * fails so `npm test` is still useful on a machine without the password.
 */
export function credentials() {
  if (process.env.SUPABASE_DB_URL) return { connectionString: process.env.SUPABASE_DB_URL };
  if (!fs.existsSync(PW_FILE)) return null;
  const password = fs.readFileSync(PW_FILE, "utf8").trim();
  if (!password) return null;
  return {
    host: POOLER,
    port: 5432,
    user: `postgres.${REF}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  };
}

export async function connect() {
  const creds = credentials();
  if (!creds) return null;
  const client = new pg.Client(creds);
  await client.connect();
  await client.query("begin");
  return client;
}

/** Roll back everything and disconnect. Called even when tests fail. */
export async function teardown(client) {
  if (!client) return;
  try {
    await client.query("rollback");
  } finally {
    await client.end();
  }
}

/**
 * Run SQL as a signed-in user, exactly as PostgREST would: the `authenticated`
 * role with a forged request.jwt.claims, so auth.uid() resolves and every
 * policy evaluates for real.
 *
 * Returns {ok, rows, count} or {ok:false, error} — denials are values, not
 * exceptions, so a test can assert on them.
 */
export async function asUser(client, userId, sql, params = []) {
  await client.query("savepoint probe");
  try {
    await client.query("set local role authenticated");
    await client.query(`select set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const r = await client.query(sql, params);
    await client.query("reset role");
    await client.query("release savepoint probe");
    return { ok: true, rows: r.rows, count: r.rowCount };
  } catch (e) {
    await client.query("rollback to savepoint probe");
    await client.query("reset role");
    return { ok: false, error: e.message.split("\n")[0] };
  }
}

/** True when the statement was refused by RLS rather than by a typo. */
export function deniedByPolicy(res) {
  return (
    !res.ok &&
    /row-level security|permission denied|violates row-level/i.test(res.error)
  );
}

/**
 * Create one auth user + profile per persona, plus the fixtures the policies
 * are written against: a department lead, an Elders member, a child with
 * medical notes, a group, and a task.
 *
 * Runs as `postgres`, which owns the tables and so bypasses RLS — fixtures are
 * setup, not the thing under test.
 */
export async function seed(client) {
  const campus =
    (await client.query(`select id from public.campuses order by created_at limit 1`)).rows[0]?.id ??
    null;

  const ids = {};
  let n = 1;
  for (const persona of PERSONAS) {
    const id = uid(n++);
    ids[persona] = id;
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         $2::text, '', now(), now(), now(), '{}'::jsonb,
         jsonb_build_object('full_name', $3::text))`,
      [id, `zz.rls.${persona.toLowerCase()}@example.invalid`, `ZZ RLS ${persona}`],
    );
    // Campus matters, not just role: profiles_checkin_insert is campus-scoped,
    // so a volunteer with no campus cannot register anyone — which is the same
    // rule CheckinStation enforces before it will check anybody in.
    await client.query(
      `update public.profiles set role = $2, campus_id = $3 where user_id = $1`,
      [id, ["Lead", "Elder"].includes(persona) ? "Member" : persona, campus],
    );
  }

  // The Volunteer persona serves in the Children's Department, because that is
  // how a volunteer earns check-in now (0064) — the role alone no longer grants
  // it. Without this the fixture models a volunteer who never checks anyone in,
  // and every test about the check-in desk would be exercising the wrong person.
  await client.query(
    `update public.departments set can_check_in = true where slug = 'children-s-department'`,
  );
  await client.query(
    `insert into public.department_members (department_id, profile_id, role)
     select d.id, p.id, 'member' from public.departments d, public.profiles p
      where d.slug = 'children-s-department' and p.user_id = $1
     on conflict (department_id, profile_id) do nothing`,
    [ids.Volunteer],
  );

  // A lead of Praise Team — leads get extra reach through can_see_contact_info().
  await client.query(
    `insert into public.department_members (department_id, profile_id, role)
     select d.id, p.id, 'lead' from public.departments d, public.profiles p
     where d.slug = 'praise-team' and p.user_id = $1
     on conflict (department_id, profile_id) do update set role = 'lead'`,
    [ids.Lead],
  );

  // A real member of the private Elders department, so roster-enumeration tests
  // have something to find rather than passing on an empty table.
  await client.query(
    `insert into public.department_members (department_id, profile_id, role)
     select d.id, p.id, 'member' from public.departments d, public.profiles p
     where d.slug = 'elders' and p.user_id = $1
     on conflict (department_id, profile_id) do nothing`,
    [ids.Elder],
  );
  await client.query(
    `insert into public.messages (channel_id, sender_profile_id, body)
     select ch.id, p.id, 'zz elders confidential'
     from public.channels ch join public.departments d on d.id = ch.department_id,
          public.profiles p
     where d.slug = 'elders' and p.user_id = $1`,
    [ids.Elder],
  );

  const child = (
    await client.query(
      `insert into public.profiles
         (full_name, email, phone, address, emergency_phone, date_of_birth,
          is_child, role, has_allergy, campus_id)
       values ('ZZ RLS Child', 'zz.child@example.invalid', '555-0100', '1 Test Lane',
               '555-0199', '2019-04-01', true, 'Member', true, $1)
       returning id`,
      [campus],
    )
  ).rows[0].id;
  await client.query(
    `insert into public.profile_medical (profile_id, has_allergy, allergy_notes, medical_notes)
     values ($1, true, 'peanuts', 'carries an epipen')`,
    [child],
  );

  const group = (
    await client.query(
      `insert into public.groups (name, created_by)
       select 'ZZ RLS Group', p.id from public.profiles p where p.user_id = $1
       returning id`,
      [ids.Staff],
    )
  ).rows[0].id;

  const task = (
    await client.query(
      `insert into public.tasks (title, assigned_profile_id, created_by)
       select 'ZZ RLS Task', a.id, b.id from public.profiles a, public.profiles b
       where a.user_id = $1 and b.user_id = $2 returning id`,
      [ids.Member, ids.Staff],
    )
  ).rows[0].id;

  const eldersChannel = (
    await client.query(
      `select ch.id from public.channels ch
       join public.departments d on d.id = ch.department_id where d.slug = 'elders'`,
    )
  ).rows[0]?.id ?? null;

  return { ids, child, group, task, campus, eldersChannel };
}
