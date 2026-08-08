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
  test("lib/roles.ts CHECKIN_ROLES matches public.is_checkin_role()", async (t) => {
    if (!requireDb(t)) return;
    const src = (
      await db.query(`select prosrc from pg_proc where proname = 'is_checkin_role'`)
    ).rows[0].prosrc;
    const fromSql = [...src.matchAll(/'([A-Za-z_]+)'/g)]
      .map((m) => m[1])
      .filter((r) => ["Super_Admin", "IT_Admin", "Staff", "Volunteer", "Member"].includes(r));

    // lib/roles.ts is TypeScript; read it as text rather than importing.
    const fs = await import("node:fs");
    const text = fs.readFileSync(new URL("../../lib/roles.ts", import.meta.url), "utf8");
    const fromApp = [...text.matchAll(/"([A-Za-z_]+)"/g)]
      .map((m) => m[1])
      .filter((r) => ["Super_Admin", "IT_Admin", "Staff", "Volunteer", "Member"].includes(r));

    assert.deepEqual(
      [...new Set(fromApp)].sort(),
      [...new Set(fromSql)].sort(),
      "the app and the database disagree about who may run check-in",
    );
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

  test("every children's room has a ratio", async (t) => {
    if (!requireDb(t)) return;
    const res = await db.query(
      `select name from public.rooms where active and max_children_per_adult is null`,
    );
    assert.equal(
      res.rowCount,
      0,
      `no ratio set for: ${res.rows.map((r) => r.name).join(", ")} — those rooms warn about nothing`,
    );
  });
});

describe("storage", () => {
  test("a member cannot list arbitrary stored objects", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Member,
      `select count(*)::int n from storage.objects where name not like 'profiles/%'`,
    );
    assert.equal(res.ok ? res.rows[0].n : 0, 0, "non-profile objects were listable");
  });
});

describe("kiosk exit PIN", () => {
  // The tablet in the lobby is signed in as a real account. The PIN is what
  // keeps a curious hand off the rest of the app, so it must not be readable
  // by the very accounts it is meant to stop.
  for (const role of ["Member", "Volunteer", "Staff", "IT_Admin", "Super_Admin"]) {
    test(`${role} cannot read the stored kiosk PIN hash`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(
        db,
        fx.ids[role],
        `select kiosk_exit_pin_hash from public.checkin_settings where id`,
      );
      assert.ok(
        !res.ok && /permission denied/i.test(res.error),
        `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`,
      );
    });
  }

  test("select * on checkin_settings is refused, so a wildcard cannot leak it", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Super_Admin, `select * from public.checkin_settings`);
    assert.ok(!res.ok, "select * returned rows — a new secret column would leak by default");
  });

  test("the columns the app actually names still read", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(
      db,
      fx.ids.Volunteer,
      `select require_pickup_verification, auto_checkout_enabled
         from public.checkin_settings where id`,
    );
    assert.ok(res.ok, `check-in settings unreadable: ${res.error}`);
  });

  test("a super admin can still save the check-in settings", async (t) => {
    if (!requireDb(t)) return;
    // .eq("id", true) puts `id` in the WHERE clause, and column privileges are
    // checked there too — this is the exact shape that 0049 broke elsewhere.
    const res = await asUser(
      db,
      fx.ids.Super_Admin,
      `update public.checkin_settings
          set require_pickup_verification = require_pickup_verification
        where id = true`,
    );
    assert.ok(res.ok, `super admin cannot save settings: ${res.error}`);
  });

  for (const role of ["Member", "Volunteer", "Staff", "IT_Admin"]) {
    test(`${role} cannot set the kiosk exit PIN`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(db, fx.ids[role], `select public.kiosk_set_exit_pin('1234')`);
      assert.ok(!res.ok, "a non-admin was allowed to change the kiosk PIN");
    });
  }

  test("the brute-force counter is not an endpoint", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Member, `select * from public.kiosk_pin_attempts`);
    assert.ok(
      !res.ok && /permission denied/i.test(res.error),
      `expected denial, got: ${res.ok ? "ALLOWED" : res.error}`,
    );
  });

  test("with no PIN configured, unlocking is allowed rather than impossible", async (t) => {
    if (!requireDb(t)) return;
    // Fail-open is deliberate here: a tablet nobody can unlock is worse than a
    // tablet with no PIN, and the admin screen says so out loud.
    await db.query(`update public.checkin_settings set kiosk_exit_pin_hash = null where id`);
    const res = await asUser(db, fx.ids.Volunteer, `select public.kiosk_check_exit_pin('0000') as ok`);
    assert.equal(res.ok && res.rows[0].ok, true);
  });

  test("a wrong PIN is rejected and a right one accepted", async (t) => {
    if (!requireDb(t)) return;
    await db.query(
      `update public.checkin_settings
          set kiosk_exit_pin_hash = extensions.crypt('4821', extensions.gen_salt('bf', 6))
        where id`,
    );
    const bad = await asUser(db, fx.ids.Volunteer, `select public.kiosk_check_exit_pin('0000') as ok`);
    assert.equal(bad.ok && bad.rows[0].ok, false, "a wrong PIN unlocked the tablet");
    const good = await asUser(db, fx.ids.Volunteer, `select public.kiosk_check_exit_pin('4821') as ok`);
    assert.equal(good.ok && good.rows[0].ok, true, "the correct PIN did not unlock");
  });
});

describe("invite link redemption", () => {
  // The check and the increment used to be two round trips with the account
  // creation between them, so two people opening a single-use link together
  // both passed the check and both got an account.
  test("a single-use link can only be claimed once", async (t) => {
    if (!requireDb(t)) return;
    const code = "ZZONCE" + Math.floor(Math.random() * 100000);
    await db.query(
      `insert into public.invite_links (code, label, role, department_ids, max_uses, uses, expires_at)
       values ($1, 'zz test', 'Member', '{}'::uuid[], 1, 0, now() + interval '1 hour')`,
      [code],
    );
    const first = await db.query(`select * from public.claim_invite_link($1)`, [code]);
    const second = await db.query(`select * from public.claim_invite_link($1)`, [code]);
    assert.equal(first.rowCount, 1, "the first claim was refused");
    assert.equal(second.rowCount, 0, "a single-use link was claimed twice");
  });

  test("an expired link cannot be claimed", async (t) => {
    if (!requireDb(t)) return;
    const code = "ZZOLD" + Math.floor(Math.random() * 100000);
    await db.query(
      `insert into public.invite_links (code, label, role, department_ids, max_uses, uses, expires_at)
       values ($1, 'zz test', 'Member', '{}'::uuid[], null, 0, now() - interval '1 minute')`,
      [code],
    );
    const res = await db.query(`select * from public.claim_invite_link($1)`, [code]);
    assert.equal(res.rowCount, 0, "an expired link was still claimable");
  });

  test("a switched-off link cannot be claimed", async (t) => {
    if (!requireDb(t)) return;
    const code = "ZZOFF" + Math.floor(Math.random() * 100000);
    await db.query(
      `insert into public.invite_links (code, label, role, department_ids, active, expires_at)
       values ($1, 'zz test', 'Member', '{}'::uuid[], false, now() + interval '1 hour')`,
      [code],
    );
    const res = await db.query(`select * from public.claim_invite_link($1)`, [code]);
    assert.equal(res.rowCount, 0, "a deactivated link was still claimable");
  });

  test("releasing a failed signup hands the use back", async (t) => {
    if (!requireDb(t)) return;
    const code = "ZZREL" + Math.floor(Math.random() * 100000);
    await db.query(
      `insert into public.invite_links (code, label, role, department_ids, max_uses, uses, expires_at)
       values ($1, 'zz test', 'Member', '{}'::uuid[], 1, 0, now() + interval '1 hour')`,
      [code],
    );
    const claimed = await db.query(`select * from public.claim_invite_link($1)`, [code]);
    await db.query(`select public.release_invite_link($1)`, [claimed.rows[0].id]);
    const again = await db.query(`select * from public.claim_invite_link($1)`, [code]);
    assert.equal(again.rowCount, 1, "a released use did not become available again");
  });

  for (const role of ["Member", "Volunteer", "Staff", "IT_Admin", "Super_Admin"]) {
    test(`${role} cannot claim links directly and burn every invite`, async (t) => {
      if (!requireDb(t)) return;
      const res = await asUser(db, fx.ids[role], `select * from public.claim_invite_link('ZZANY')`);
      assert.ok(!res.ok, "claim_invite_link is callable from the browser");
    });
  }
});

describe("report aggregates", () => {
  test("the people breakdown totals the actual head count", async (t) => {
    if (!requireDb(t)) return;
    // The page used to fetch rows and count them in JS, which silently stopped
    // at PostgREST's 1000-row cap.
    const res = await db.query(
      `select (select coalesce(sum(n),0) from public.report_people_breakdown()) as grouped,
              (select count(*) from public.profiles where archived_at is null) as actual`,
    );
    assert.equal(Number(res.rows[0].grouped), Number(res.rows[0].actual));
  });

  test("weekly buckets are Sunday-anchored in Central time", async (t) => {
    if (!requireDb(t)) return;
    // Every day from Sunday to Saturday must land on the same Sunday, and the
    // Saturday before must not.
    const res = await db.query(
      `with days as (
         select generate_series(timestamptz '2026-08-02 09:00:00-05',
                                timestamptz '2026-08-08 21:00:00-05',
                                interval '1 day') ts)
       select count(distinct (date_trunc('week', (ts at time zone 'America/Chicago') + interval '1 day')
                              - interval '1 day')::date) as buckets from days`,
    );
    assert.equal(Number(res.rows[0].buckets), 1, "one week spanned more than one bucket");
  });

  test("a member cannot aggregate people they cannot see", async (t) => {
    if (!requireDb(t)) return;
    // SECURITY INVOKER, so the same RLS that scoped the old row fetch applies.
    const mine = await asUser(db, fx.ids.Member, `select coalesce(sum(n),0)::int t from public.report_people_breakdown()`);
    const all = await db.query(`select count(*)::int t from public.profiles where archived_at is null`);
    assert.ok(mine.ok, `breakdown unusable for a member: ${mine.error}`);
    assert.ok(
      mine.rows[0].t <= all.rows[0].t,
      "a member aggregated more people than exist",
    );
  });
});
