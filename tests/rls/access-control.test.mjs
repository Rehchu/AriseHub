// What each role may and may not do.
//
// Every case here is a hole that was open in production on 2026-08-08 and was
// closed, or a behaviour that must not regress while closing one. The
// descriptions say what the failure would mean rather than naming a policy, so
// a red test tells you what broke for whom.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { connect, teardown, seed, asUser, deniedByPolicy, ROLES } from "./helpers.mjs";

let db = null;
let fx = null;

before(async () => {
  db = await connect();
  if (db) fx = await seed(db);
});

after(async () => {
  await teardown(db);
});

/** Skips the whole suite, loudly, when there are no database credentials. */
function requireDb(t) {
  if (!db) {
    t.skip("no database credentials — set SUPABASE_DB_URL or .supabase-db-password");
    return false;
  }
  return true;
}

describe("invite links", () => {
  // leads_all_departments('{}') is vacuously true, so an empty array satisfied
  // every branch and any member could mint an unlimited, never-expiring
  // self-registration link — reopening public signup for the whole church.
  for (const role of ["Member", "Volunteer", "Staff", "IT_Admin"]) {
    test(`${role} cannot mint an unlimited, never-expiring invite link`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `insert into public.invite_links (code, label, role, department_ids, max_uses, expires_at)
         values ($1::text, 'zz', 'Member', '{}'::uuid[], null, now() + interval '10 years')`,
        [`ZZT${role.slice(0, 5).toUpperCase()}`],
      );
      assert.ok(deniedByPolicy(res), `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`);
    });
  }

  test("Super_Admin can still issue one", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Super_Admin,
      `insert into public.invite_links (code, label, role, department_ids)
       values ('ZZTSUPER', 'zz', 'Member', '{}'::uuid[])`,
    );
    assert.ok(res.ok, `Super_Admin blocked from issuing invites: ${res.error}`);
  });
});

describe("groups", () => {
  for (const role of ["Member", "Volunteer"]) {
    test(`${role} cannot make themselves leader of someone else's group`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `insert into public.group_members (group_id, profile_id, role)
         select $1, p.id, 'leader' from public.profiles p where p.user_id = $2`,
        [fx.group, fx.ids[role]],
      );
      assert.ok(deniedByPolicy(res), `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`);
    });
  }

  test("a member can still join a group as a member", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.group_members (group_id, profile_id, role)
       select $1, p.id, 'member' from public.profiles p where p.user_id = $2`,
      [fx.group, fx.ids.Member],
    );
    assert.ok(res.ok, `joining a group should still work: ${res.error}`);
  });
});

describe("privilege escalation", () => {
  // The privileged-field trigger tested `new.user_id = auth.uid()`. Setting
  // new.user_id to null made that NULL rather than true, skipping every freeze,
  // so a check-in role could hand itself Super_Admin in one statement.
  for (const role of ["Volunteer", "Staff"]) {
    test(`${role} cannot escalate by nulling their own user_id`, async (t) => {
      if (!requireDb(t)) return;
      await asUser(
        db,
        fx.ids[role],
        `update public.profiles set user_id = null, role = 'Super_Admin' where user_id = $1`,
        [fx.ids[role]],
      );
      const check = await db.query(`select role, user_id from public.profiles where user_id = $1`, [
        fx.ids[role],
      ]);
      assert.equal(
        check.rows[0]?.role,
        role,
        `${role} escalated to ${check.rows[0]?.role} by detaching their user_id`,
      );
    });
  }

  test("a member cannot set their own role directly", async (t) => {
    if (!requireDb(t)) return;
    await asUser(db, fx.ids.Member, `update public.profiles set role = 'Super_Admin' where user_id = $1`, [
      fx.ids.Member,
    ]);
    const check = await db.query(`select role from public.profiles where user_id = $1`, [fx.ids.Member]);
    assert.equal(check.rows[0]?.role, "Member");
  });

  test("check-in staff cannot create a Super_Admin person record", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `insert into public.profiles (full_name, role, user_id, campus_id)
       values ('ZZ RLS Ghost', 'Super_Admin', null, $1)`,
      [fx.campus],
    );
    assert.ok(deniedByPolicy(res), `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`);
  });
});

describe("private channels", () => {
  test("a member cannot read Elders messages", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Member, `select body from public.messages where channel_id = $1`, [
      fx.eldersChannel,
    ]);
    assert.equal(res.ok ? res.count : 0, 0, "Elders conversation was readable");
  });

  test("a member cannot enumerate the Elders roster", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `select count(*)::int n from public.department_members dm
       join public.departments d on d.id = dm.department_id where d.slug = 'elders'`,
    );
    assert.equal(res.ok ? res.rows[0].n : 0, 0, "the private roster was listable one table over");
  });

  test("an Elders member can see their own roster", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Elder,
      `select count(*)::int n from public.department_members dm
       join public.departments d on d.id = dm.department_id where d.slug = 'elders'`,
    );
    assert.ok(res.ok && res.rows[0].n > 0, "an elder lost sight of their own department");
  });

  test("public department rosters stay visible", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `select count(*)::int n from public.department_members dm
       join public.departments d on d.id = dm.department_id where d.slug = 'praise-team'`,
    );
    assert.ok(res.ok && res.rows[0].n > 0, "non-private rosters should still be readable");
  });
});

describe("children's data", () => {
  for (const role of ROLES.filter((r) => r !== "Super_Admin")) {
    test(`${role} cannot read a child's medical notes`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(db, fx.ids[role], `select allergy_notes from public.profile_medical`);
      assert.equal(res.ok ? res.count : 0, 0, "medical notes were readable");
    });
  }

  test("a volunteer can record an allergy without being able to read one", async (t) => {
    if (!requireDb(t)) return;
    const kid = (
      await db.query(
        `insert into public.profiles (full_name, is_child, role, campus_id)
         values ('ZZ RLS Kid2', true, 'Member', $1) returning id`,
        [fx.campus],
      )
    ).rows[0].id;
    const write = await asUser(
      db,
      fx.ids.Volunteer,
      `insert into public.profile_medical (profile_id, has_allergy, allergy_notes)
       values ($1, true, 'shellfish')`,
      [kid],
    );
    assert.ok(write.ok, `family registration cannot record an allergy: ${write.error}`);
    const read = await asUser(db, fx.ids.Volunteer, `select allergy_notes from public.profile_medical`);
    assert.equal(read.ok ? read.count : 0, 0, "recording an allergy also granted read access");
  });

  test("the allergy flag still reaches the badge, via checkin_people", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `select has_allergy from public.checkin_people where id = $1`,
      [fx.child],
    );
    assert.ok(res.ok && res.rows[0]?.has_allergy === true, "the red flag vanished from the roster");
  });

  // 0049. profiles_select stays `using (true)` because the directory and every
  // embedded profiles(full_name) lookup depend on it — so the gate is the
  // COLUMN grant, not the row policy.
  for (const col of [
    "date_of_birth",
    "has_allergy",
    "hidden_from_directory",
    "membership_status",
    "elvanto_id",
  ]) {
    test(`nobody reads profiles.${col} directly`, async (t) => {
      if (!requireDb(t)) return;
      for (const role of [...ROLES, "Lead"]) {
        const res = await asUser(db, fx.ids[role], `select ${col} from public.profiles limit 1`);
        assert.ok(
          !res.ok && /permission denied|does not exist/i.test(res.error),
          `${role} can still read profiles.${col} church-wide`,
        );
      }
    });
  }

  test("a Volunteer still gets ages through checkin_people", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `select date_of_birth from public.checkin_people where id = $1`,
      [fx.child],
    );
    assert.ok(res.ok && res.rows[0]?.date_of_birth, "check-in lost the ages it needs for room assignment");
  });

  test("a plain Member does not", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Member, `select count(*)::int n from public.checkin_people`);
    assert.equal(res.ok ? res.rows[0].n : 0, 0, "checkin_people leaked to a non-check-in role");
  });

});

describe("contact privacy", () => {
  for (const role of ["Member", "Volunteer"]) {
    test(`${role} sees contact details redacted`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `select address, emergency_phone from public.people_directory where id = $1`,
        [fx.child],
      );
      assert.ok(res.ok, `the directory itself broke: ${res.error}`);
      assert.equal(res.rows[0]?.address, null, "a home address leaked");
    });
  }

  // Guards the outage caused by revoking EXECUTE on the SECURITY DEFINER
  // helpers: people_directory stopped working entirely for everyone.
  for (const role of ["Staff", "IT_Admin", "Super_Admin", "Lead"]) {
    test(`${role} can still read contact details`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `select address, contact_visible from public.people_directory where id = $1`,
        [fx.child],
      );
      assert.ok(res.ok, `people_directory raised for ${role}: ${res.error}`);
      assert.ok(res.rows[0]?.address, `${role} lost access to contact details`);
    });
  }
});

describe("family registration", () => {
  // Every step below was denied for the roles that work the desk, so the form
  // threw partway through and left orphaned person records behind.
  for (const role of ["Volunteer", "Staff"]) {
    test(`${role} can complete a family registration`, async (t) => {
      if (!requireDb(t)) return;
      const kid = await asUser(
        db,
        fx.ids[role],
        `insert into public.profiles (full_name, is_child, role, campus_id)
         values ('ZZ RLS FamKid', true, 'Member', $1) returning id`,
        [fx.campus],
      );
      assert.ok(kid.ok, `cannot create a child: ${kid.error}`);

      const parent = await asUser(
        db,
        fx.ids[role],
        `insert into public.profiles (full_name, role, campus_id)
         values ('ZZ RLS FamParent', 'Member', $1) returning id`,
        [fx.campus],
      );
      assert.ok(parent.ok, `cannot create a parent: ${parent.error}`);

      const family = await asUser(
        db,
        fx.ids[role],
        `insert into public.families (family_name) values ('ZZ RLS Fam') returning id`,
      );
      assert.ok(family.ok, `cannot create the family: ${family.error}`);

      const member = await asUser(
        db,
        fx.ids[role],
        `insert into public.family_members (family_id, profile_id, relationship_type)
         values ($1, $2, 'Head of Household')`,
        [family.rows[0].id, parent.rows[0].id],
      );
      assert.ok(member.ok, `cannot add to the household: ${member.error}`);

      const guardian = await asUser(
        db,
        fx.ids[role],
        `insert into public.guardians (child_profile_id, guardian_profile_id, can_pickup)
         values ($1, $2, true)`,
        [kid.rows[0].id, parent.rows[0].id],
      );
      assert.ok(guardian.ok, `cannot record who may collect the child: ${guardian.error}`);
    });
  }

  test("'Parent' is not a valid relationship_type", async (t) => {
    if (!requireDb(t)) return;
    // The form used this value for two years' worth of migrations. Asserting on
    // it means the enum and the form can't drift apart again silently.
    const res = await db
      .query(`select unnest(enum_range(null::relationship_type))::text as v`)
      .then((r) => r.rows.map((x) => x.v));
    assert.ok(!res.includes("Parent"), "enum changed — update FamilyRegister");
    assert.ok(res.includes("Head of Household") && res.includes("Spouse"));
  });
});

describe("audit trail", () => {
  test("a member cannot forge an audit row", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.chms_audit_log (action, entity_type) values ('zz', 'test')`,
    );
    assert.ok(deniedByPolicy(res), `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`);
  });

  test("a member cannot delete check-in records", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Member, `delete from public.checkins`);
    assert.ok(!res.ok || res.count === 0, "child-safety records were deletable");
  });

  test("check-in codes are unique among children currently present", async (t) => {
    if (!requireDb(t)) return;
    const idx = await db.query(
      `select indexdef from pg_indexes
       where schemaname = 'public' and indexname = 'checkins_active_code_uidx'`,
    );
    assert.equal(idx.rowCount, 1, "the unique index guarding pickup is gone");
    assert.match(idx.rows[0].indexdef, /CREATE UNIQUE INDEX/);
  });
});

describe("audit trail actually records", () => {
  // chms_audit_log sat empty since 0001 — carefully protected, never written
  // to. These assert the triggers fire, because a tamper-proof log that records
  // nothing still looks like a control.
  const auditCount = async (action) =>
    (await db.query(`select count(*)::int n from public.chms_audit_log where action = $1`, [action]))
      .rows[0].n;

  test("a role change is recorded", async (t) => {
    if (!requireDb(t)) return;
    const before = await auditCount("profile.privileged_change");
    await asUser(
      db,
      fx.ids.Super_Admin,
      `update public.profiles set role = 'Staff' where user_id = $1`,
      [fx.ids.Volunteer],
    );
    assert.ok((await auditCount("profile.privileged_change")) > before, "role change went unrecorded");

    // Put it back. This left the Volunteer persona as Staff for the rest of the
    // run, so every later test that thought it was exercising a volunteer was
    // exercising a staff member. It went unnoticed for as long as both roles
    // could run check-in; the moment 0064 made them differ, five tests started
    // lying. Fixtures shared across a transaction have to be returned as found.
    await db.query(`update public.profiles set role = 'Volunteer' where user_id = $1`, [
      fx.ids.Volunteer,
    ]);
  });

  test("granting pickup authorisation is recorded", async (t) => {
    if (!requireDb(t)) return;
    const before = await auditCount("guardian.insert");
    await asUser(
      db,
      fx.ids.Super_Admin,
      `insert into public.guardians (child_profile_id, guardian_profile_id, can_pickup)
       select $1, p.id, true from public.profiles p where p.user_id = $2`,
      [fx.child, fx.ids.Lead],
    );
    assert.ok((await auditCount("guardian.insert")) > before, "pickup authorisation went unrecorded");
  });

  test("releasing a child to nobody named is recorded", async (t) => {
    if (!requireDb(t)) return;
    const chk = (
      await db.query(
        `insert into public.checkins (profile_id, campus_id, security_code, status)
         values ($1, $2, 'ZZAUD1', 'checked_in') returning id`,
        [fx.child, fx.campus],
      )
    ).rows[0].id;
    const before = await auditCount("checkin.released_without_authorisation");
    await db.query(
      `update public.checkins set status = 'checked_out', checked_out_at = now(),
         release_note = 'aunt collected, mother phoned' where id = $1`,
      [chk],
    );
    assert.ok(
      (await auditCount("checkin.released_without_authorisation")) > before,
      "an override release left no trace",
    );
  });

  test("a normal release to an authorised guardian is NOT logged as an override", async (t) => {
    if (!requireDb(t)) return;
    const chk = (
      await db.query(
        `insert into public.checkins (profile_id, campus_id, security_code, status)
         values ($1, $2, 'ZZAUD2', 'checked_in') returning id`,
        [fx.child, fx.campus],
      )
    ).rows[0].id;
    const before = await auditCount("checkin.released_without_authorisation");
    await db.query(
      `update public.checkins set status = 'checked_out', checked_out_at = now(),
         released_to_profile_id = (select id from public.profiles where user_id = $2)
       where id = $1`,
      [chk, fx.ids.Lead],
    );
    assert.equal(
      await auditCount("checkin.released_without_authorisation"),
      before,
      "ordinary pickups are being logged as exceptions — the log will be noise",
    );
  });

  test("an auto-checkout is NOT logged as an override", async (t) => {
    if (!requireDb(t)) return;
    const chk = (
      await db.query(
        `insert into public.checkins (profile_id, campus_id, security_code, status)
         values ($1, $2, 'ZZAUD3', 'checked_in') returning id`,
        [fx.child, fx.campus],
      )
    ).rows[0].id;
    const before = await auditCount("checkin.released_without_authorisation");
    await db.query(
      `update public.checkins set status = 'checked_out', checked_out_at = now(),
         auto_checked_out = true where id = $1`,
      [chk],
    );
    assert.equal(await auditCount("checkin.released_without_authorisation"), before);
  });

  test("issuing an invite link is recorded", async (t) => {
    if (!requireDb(t)) return;
    const before = await auditCount("invite_link.created");
    await asUser(
      db,
      fx.ids.Super_Admin,
      `insert into public.invite_links (code, label, role, department_ids)
       values ('ZZAUDLINK', 'zz', 'Member', '{}'::uuid[])`,
    );
    assert.ok((await auditCount("invite_link.created")) > before, "invite link went unrecorded");
  });

  test("only Super_Admin can read the log", async (t) => {
    if (!requireDb(t)) return;
    for (const role of ["Member", "Volunteer", "Staff", "IT_Admin"]) {
      const res = await asUser(db, fx.ids[role], `select count(*)::int n from public.chms_audit_log`);
      assert.equal(res.ok ? res.rows[0].n : 0, 0, `${role} could read the audit trail`);
    }
  });
});

describe("messaging", () => {
  test("a member can mark their own channel read", async (t) => {
    if (!requireDb(t)) return;
    const row = await db.query(
      `select cm.id from public.channel_members cm
       join public.profiles p on p.id = cm.profile_id
       where p.user_id = $1 limit 1`,
      [fx.ids.Elder],
    );
    if (row.rowCount === 0) return t.skip("no channel membership fixture");
    const res = await asUser(
      db,
      fx.ids.Elder,
      `update public.channel_members set last_read_at = now() where id = $1`,
      [row.rows[0].id],
    );
    assert.ok(res.ok && res.count === 1, "unread badges can never clear");
  });
});

describe("tasks", () => {
  test("an assignee cannot reassign a task away from themselves", async (t) => {
    if (!requireDb(t)) return;
    await asUser(
      db,
      fx.ids.Member,
      `update public.tasks
         set created_by = (select id from public.profiles where user_id = $1),
             assigned_profile_id = (select id from public.profiles where user_id = $2)
       where id = $3`,
      [fx.ids.Member, fx.ids.Volunteer, fx.task],
    );
    const check = await db.query(
      `select p.user_id from public.tasks t join public.profiles p on p.id = t.assigned_profile_id
       where t.id = $1`,
      [fx.task],
    );
    assert.equal(check.rows[0]?.user_id, fx.ids.Member, "the task was reassigned by its assignee");
  });
});

describe("calendar", () => {
  test("a member cannot publish a self-approved event", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.events (title, starts_at, ends_at, status, is_public, requested_by)
       select 'ZZ RLS Event', now(), now() + interval '1 hour', 'approved', true, p.id
       from public.profiles p where p.user_id = $1`,
      [fx.ids.Member],
    );
    assert.ok(deniedByPolicy(res), `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`);
  });

  test("a member can still request one", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.events (title, starts_at, ends_at, status, is_public, requested_by)
       select 'ZZ RLS Request', now(), now() + interval '1 hour', 'pending', false, p.id
       from public.profiles p where p.user_id = $1`,
      [fx.ids.Member],
    );
    assert.ok(res.ok, `requesting an event should still work: ${res.error}`);
  });
});

describe("check-in access agrees between app and database", () => {
  // There were three lists and they disagreed: the page guard admitted
  // IT_Admin (whose inserts RLS then refused) and redirected Volunteers away
  // from the desk the whole check-in schema is written for.
  test("the elevated roles in lib/roles.ts match public.is_checkin_role()", async (t) => {
    if (!requireDb(t)) return;
    // Only the ROLE half can be compared as a list. Since 0064 the rule is
    // "elevated role OR a department with can_check_in", and the department half
    // has no equivalent in TypeScript at all — which is the point: the page
    // guard now CALLS is_checkin_role() instead of re-implementing it, so the
    // two cannot drift the way the three original lists did.
    const src = (
      await db.query(`select prosrc from pg_proc where proname = 'is_checkin_role'`)
    ).rows[0].prosrc;
    const ROLES = ["Super_Admin", "Admin", "IT_Admin", "Staff", "Volunteer", "Member"];
    const fromSql = [...new Set(
      [...src.matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]).filter((r) => ROLES.includes(r)),
    )].sort();

    const fs = await import("node:fs");
    const text = fs.readFileSync(new URL("../../lib/roles.ts", import.meta.url), "utf8");
    const listed = text.match(/ELEVATED_CHECKIN_ROLES[^=]*=\s*\[([^\]]*)\]/);
    const fromApp = [...new Set(
      [...(listed?.[1] ?? "").matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]),
    )].sort();

    assert.deepEqual(
      fromApp,
      fromSql,
      "the app and the database disagree about which roles run check-in regardless of department",
    );
  });

  test("the page guard does not re-implement the rule", async (t) => {
    if (!requireDb(t)) return;
    // The original bug was three copies of the rule in three places. A guard
    // that hardcodes roles again would pass every other test in this file and
    // still let somebody onto a page whose every write RLS refuses.
    const fs = await import("node:fs");
    const offenders = [];
    for (const rel of ["../../app/(app)/checkins/page.tsx", "../../app/kiosk/page.tsx"]) {
      const text = fs.readFileSync(new URL(rel, import.meta.url), "utf8");
      if (!/canRunCheckin\(\s*supabase\s*\)/.test(text)) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], "a check-in page guard stopped asking the database");
  });

  test("a Volunteer can actually insert a check-in", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `insert into public.checkins (profile_id, campus_id, security_code, status)
       values ($1, $2, 'ZZROLE', 'checked_in')`,
      [fx.child, fx.campus],
    );
    assert.ok(res.ok, `the role that works the desk cannot check anyone in: ${res.error}`);
  });

  test("an IT_Admin cannot", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.IT_Admin,
      `insert into public.checkins (profile_id, campus_id, security_code, status)
       values ($1, $2, 'ZZROLE2', 'checked_in')`,
      [fx.child, fx.campus],
    );
    assert.ok(
      deniedByPolicy(res),
      "IT_Admin can insert check-ins — then the nav should offer it, not hide it",
    );
  });
});

describe("room staffing", () => {
  test("check-in staff can record how many adults are in a room", async (t) => {
    if (!requireDb(t)) return;
    const room = await db.query(`select id from public.rooms limit 1`);
    if (room.rowCount === 0) return t.skip("no rooms configured");
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `insert into public.room_staffing (room_id, on_date, adults) values ($1, current_date, 3)
       on conflict (room_id, on_date) do update set adults = 3`,
      [room.rows[0].id],
    );
    assert.ok(res.ok, `the station cannot record staffing: ${res.error}`);
  });

  test("a plain member cannot", async (t) => {
    if (!requireDb(t)) return;
    const room = await db.query(`select id from public.rooms limit 1`);
    if (room.rowCount === 0) return t.skip("no rooms configured");
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.room_staffing (room_id, on_date, adults) values ($1, current_date, 99)
       on conflict (room_id, on_date) do update set adults = 99`,
      [room.rows[0].id],
    );
    assert.ok(deniedByPolicy(res), `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`);
  });


  for (const role of ["Member", "Volunteer", "Staff"]) {
    test(`${role} still cannot post in a chat they are not in`, async (t) => {
      if (!requireDb(t)) return;
      const ch = await db.query(
        `select c.id from public.channels c
          where c.type = 'department'
            and not exists (select 1 from public.channel_members m
                             join public.profiles p on p.id = m.profile_id
                            where m.channel_id = c.id and p.user_id = $1)
          limit 1`,
        [fx.ids[role]],
      );
      if (ch.rowCount === 0) return t.skip("no department channel this persona is outside of");
      const res = await asUser(
        db,
        fx.ids[role],
        `insert into public.messages (channel_id, sender_profile_id, body)
         values ($1, public.current_profile_id(), 'zz should be refused')`,
        [ch.rows[0].id],
      );
      assert.ok(!res.ok, `${role} was allowed to post into a chat they do not belong to`);
    });
  }
});

describe("IT support threads", () => {
  // Opening the IT chat gives you YOUR thread with IT, not a shared room —
  // nobody should see that someone else forgot their password. The requester is
  // covered by ordinary channel membership; IT sees every thread for its own
  // department even if they joined after one was opened.
  async function openThread(userId) {
    const res = await asUser(db, userId, `select public.get_or_create_support_thread('it') as id`);
    assert.ok(res.ok, `could not open a support thread: ${res.error}`);
    return res.rows[0].id;
  }

  test("anyone can open a thread with IT without being in IT", async (t) => {
    if (!requireDb(t)) return;
    const id = await openThread(fx.ids.Member);
    assert.ok(id, "no channel came back");
  });

  test("reopening returns the same thread rather than a second one", async (t) => {
    if (!requireDb(t)) return;
    const a = await openThread(fx.ids.Member);
    const b = await openThread(fx.ids.Member);
    assert.equal(a, b, "a second thread was created for the same person");
  });

  test("the requester can post in their own thread", async (t) => {
    if (!requireDb(t)) return;
    const id = await openThread(fx.ids.Member);
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.messages (channel_id, sender_profile_id, body)
       values ($1, public.current_profile_id(), 'zz my password is broken')`,
      [id],
    );
    assert.ok(res.ok, `requester could not post in their own thread: ${res.error}`);
  });

  test("ANOTHER member cannot read someone else's support thread", async (t) => {
    if (!requireDb(t)) return;
    // The entire reason this is a per-person thread and not one shared room.
    const id = await openThread(fx.ids.Member);
    await asUser(
      db,
      fx.ids.Member,
      `insert into public.messages (channel_id, sender_profile_id, body)
       values ($1, public.current_profile_id(), 'zz private problem')`,
      [id],
    );
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `select count(*)::int n from public.messages where channel_id = $1`,
      [id],
    );
    assert.equal(res.ok ? res.rows[0].n : -1, 0, "another member read someone else's support thread");
  });

  test("a Super_Admin cannot read someone else's support thread either", async (t) => {
    if (!requireDb(t)) return;
    const id = await openThread(fx.ids.Member);
    await asUser(
      db,
      fx.ids.Member,
      `insert into public.messages (channel_id, sender_profile_id, body)
       values ($1, public.current_profile_id(), 'zz private problem')`,
      [id],
    );
    const res = await asUser(
      db,
      fx.ids.Super_Admin,
      `select count(*)::int n from public.messages where channel_id = $1`,
      [id],
    );
    assert.equal(res.ok ? res.rows[0].n : -1, 0, "Super_Admin read a support thread they are not part of");
  });

  test("IT can read and reply to a thread they were never added to", async (t) => {
    if (!requireDb(t)) return;
    const id = await openThread(fx.ids.Member);
    await asUser(
      db,
      fx.ids.Member,
      `insert into public.messages (channel_id, sender_profile_id, body)
       values ($1, public.current_profile_id(), 'zz help me')`,
      [id],
    );
    // Join IT AFTER the thread exists — the case a membership snapshot misses.
    await db.query(
      `insert into public.department_members (department_id, profile_id, role)
       select d.id, p.id, 'member' from public.departments d, public.profiles p
        where d.slug = 'it' and p.user_id = $1
       on conflict (department_id, profile_id) do nothing`,
      [fx.ids.IT_Admin],
    );
    const read = await asUser(
      db,
      fx.ids.IT_Admin,
      `select count(*)::int n from public.messages where channel_id = $1`,
      [id],
    );
    assert.ok(read.ok && read.rows[0].n > 0, "IT could not read a thread opened before they joined");
    const reply = await asUser(
      db,
      fx.ids.IT_Admin,
      `insert into public.messages (channel_id, sender_profile_id, body)
       values ($1, public.current_profile_id(), 'zz have you tried turning it off')`,
      [id],
    );
    assert.ok(reply.ok, `IT could not reply: ${reply.error}`);
  });
});

describe("church branding", () => {
  // The logo is the least secret thing the church owns, so everyone reads it —
  // but only a super admin decides what it is. A volunteer at a check-in desk
  // must not be able to change what prints on every badge.
  test("anyone signed in can read the church logo", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Member, `select church_logo_url from public.app_settings`);
    assert.ok(res.ok, `the designer could not load branding: ${res.error}`);
  });

  for (const role of ["Member", "Volunteer", "Staff", "IT_Admin"]) {
    test(`${role} cannot change the church logo`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `update public.app_settings set church_logo_url = 'zz-not-allowed' where id`,
      );
      const after = await db.query(`select church_logo_url from public.app_settings where id`);
      assert.notEqual(
        after.rows[0]?.church_logo_url,
        "zz-not-allowed",
        `${role} changed what prints on every badge`,
      );
    });
  }

  test("a super admin can set it", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Super_Admin,
      `update public.app_settings set church_logo_url = 'zz-logo' where id returning id`,
    );
    assert.ok(res.ok && res.count === 1, `super admin blocked from setting the logo: ${res.error}`);
  });

  test("there can only ever be one settings row", async (t) => {
    if (!requireDb(t)) return;
    // `id boolean primary key check (id)` — a second row is impossible, so the
    // designer never has to ask which one is real.
    //
    // SAVEPOINT, because this statement is MEANT to raise. A raise poisons the
    // suite's shared transaction, and every later test then fails instantly on
    // "current transaction is aborted" — which looks like eleven broken
    // features rather than one missing savepoint.
    let threw = false;
    await db.query("savepoint dup_probe");
    try {
      await db.query(`insert into public.app_settings (id) values (true)`);
      await db.query("release savepoint dup_probe");
    } catch {
      threw = true;
      await db.query("rollback to savepoint dup_probe");
    }
    assert.ok(threw, "a second app_settings row was accepted");
  });
});

describe("ministry titles", () => {
  // A title that grants Admin is a privilege decision, not a piece of copy — so
  // everyone reads the list and only a super admin defines it.
  test("anyone signed in can read the titles", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Member, `select name, role from public.ministry_titles`);
    assert.ok(res.ok && res.count > 0, `titles unreadable: ${res.error}`);
  });

  for (const role of ["Member", "Volunteer", "Staff", "IT_Admin"]) {
    test(`${role} cannot invent a title that grants Super_Admin`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `insert into public.ministry_titles (name, role) values ('zz backdoor', 'Super_Admin')`,
      );
      assert.ok(!res.ok, `${role} created a title granting Super_Admin`);
    });

    test(`${role} cannot re-point an existing title at Super_Admin`, async (t) => {
      if (!requireDb(t)) return;
      // The subtler attack: leave the name alone, change what it grants.
      await asUser(
        db,
        fx.ids[role],
        `update public.ministry_titles set role = 'Super_Admin' where name = 'Usher'`,
      );
      const after = await db.query(`select role from public.ministry_titles where name = 'Usher'`);
      assert.notEqual(after.rows[0]?.role, "Super_Admin", `${role} re-pointed a title at Super_Admin`);
    });
  }

  test("a super admin can define one", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Super_Admin,
      `insert into public.ministry_titles (name, role) values ('zz test title', 'Staff') returning id`,
    );
    assert.ok(res.ok, `super admin blocked from adding a title: ${res.error}`);
  });

  test("a title carrying a role does NOT change anyone's access by itself", async (t) => {
    if (!requireDb(t)) return;
    // The role on a title is an OFFER the UI makes and an admin confirms. If a
    // trigger ever starts applying it, this catches it: setting the title alone
    // must leave profiles.role untouched.
    const before = await db.query(`select role from public.profiles where user_id = $1`, [
      fx.ids.Member,
    ]);
    await db.query(`update public.profiles set title = 'Apostle' where user_id = $1`, [
      fx.ids.Member,
    ]);
    const after = await db.query(`select role, title from public.profiles where user_id = $1`, [
      fx.ids.Member,
    ]);
    assert.equal(after.rows[0].title, "Apostle", "the title did not save");
    assert.equal(
      after.rows[0].role,
      before.rows[0].role,
      "setting a title silently changed someone's access level",
    );
  });
});

describe("check-in follows the department", () => {
  // 0064. Before this, check-in was Super_Admin/Staff/Volunteer church-wide,
  // which was wrong in both directions: every Praise Team volunteer could reach
  // children's records and never used it, while a Children's Department member
  // whose role was only Member could not and needed it every Sunday.
  //
  // These run inside the suite's rolled-back transaction. I verified the same
  // two cases directly against production first and it COMMITTED, creating two
  // fixture accounts that had to be deleted by hand. Twice now. Nothing that
  // seeds a user goes anywhere near execute_sql again.
  async function inDept(profileUserId, slug) {
    await db.query(
      `insert into public.department_members (department_id, profile_id, role)
       select d.id, p.id, 'member' from public.departments d, public.profiles p
        where d.slug = $2 and p.user_id = $1
       on conflict (department_id, profile_id) do nothing`,
      [profileUserId, slug],
    );
  }
  const canCheckIn = async (userId) => {
    const res = await asUser(db, userId, `select public.is_checkin_role() as ok`);
    return res.ok ? res.rows[0].ok : null;
  };

  test("a Volunteer whose only department is Praise Team cannot run check-in", async (t) => {
    if (!requireDb(t)) return;
    // ONLY Praise Team. The seed and the live data both put people in several
    // departments — the church has Volunteers and Leadership ticked too — so
    // without clearing first the fixture qualifies through a department that has
    // nothing to do with what is being tested.
    await db.query(
      `delete from public.department_members dm using public.profiles p
        where dm.profile_id = p.id and p.user_id = $1`,
      [fx.ids.Volunteer],
    );
    await db.query(`update public.departments set can_check_in = false where slug = 'praise-team'`);
    await inDept(fx.ids.Volunteer, "praise-team");

    // Assert the setup, not just the outcome. This failed once because an
    // earlier test in the shared transaction had left different state, and
    // "true !== false" gave no clue which half was wrong.
    const state = await asUser(
      db,
      fx.ids.Volunteer,
      `select public.current_profile_role()::text as role,
              coalesce((select string_agg(d.name || '=' || d.can_check_in, ', ')
                          from public.department_members dm
                          join public.departments d on d.id = dm.department_id
                         where dm.profile_id = public.current_profile_id()), '(none)') as depts,
              public.is_checkin_role() as checkin`,
    );
    const s = state.ok ? state.rows[0] : {};
    assert.equal(s.role, "Volunteer", `precondition: role is ${s.role}, not Volunteer`);
    assert.equal(
      s.checkin,
      false,
      `a Praise Team volunteer still reaches children's records — role=${s.role}, departments=${s.depts}`,
    );
  });

  test("a plain Member in a check-in department CAN run check-in", async (t) => {
    if (!requireDb(t)) return;
    await db.query(`update public.departments set can_check_in = true where slug = 'children-s-department'`);
    await inDept(fx.ids.Member, "children-s-department");
    assert.equal(await canCheckIn(fx.ids.Member), true, "the person who runs check-in every Sunday lost access");
  });

  test("ticking the flag off removes access again", async (t) => {
    if (!requireDb(t)) return;
    await inDept(fx.ids.Member, "children-s-department");
    await db.query(`update public.departments set can_check_in = false where slug = 'children-s-department'`);
    assert.equal(await canCheckIn(fx.ids.Member), false, "the toggle in Admin > Departments does not actually revoke");
  });

  test("Staff and Super_Admin keep it regardless of department", async (t) => {
    if (!requireDb(t)) return;
    await db.query(`update public.departments set can_check_in = false`);
    for (const role of ["Staff", "Super_Admin"]) {
      assert.equal(await canCheckIn(fx.ids[role]), true, `${role} lost check-in with every flag off`);
    }
  });

  test("a Member with no department still cannot", async (t) => {
    if (!requireDb(t)) return;
    await db.query(`delete from public.department_members dm using public.profiles p
                     where dm.profile_id = p.id and p.user_id = $1`, [fx.ids.Member]);
    assert.equal(await canCheckIn(fx.ids.Member), false, "check-in leaked to someone in no department at all");
  });

  test("the flag actually gates a child's medical row, not just the boolean", async (t) => {
    if (!requireDb(t)) return;
    // is_checkin_role() backs 15 policies. This asserts the WRITE path a
    // volunteer uses, so the test fails if the function is right but a policy
    // stopped calling it.
    await db.query(`update public.departments set can_check_in = true where slug = 'children-s-department'`);
    await inDept(fx.ids.Member, "children-s-department");
    const kid = (
      await db.query(
        `insert into public.profiles (full_name, is_child, role, campus_id)
         values ('ZZ Ratio Kid', true, 'Member', $1) returning id`,
        [fx.campus],
      )
    ).rows[0].id;
    const res = await asUser(
      db,
      fx.ids.Member,
      `insert into public.profile_medical (profile_id, has_allergy, allergy_notes)
       values ($1, true, 'peanuts')`,
      [kid],
    );
    assert.ok(res.ok, `a check-in department member could not record an allergy: ${res.error}`);
  });
});
