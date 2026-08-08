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

  test("the allergy flag still reaches the badge", async (t) => {
    if (!requireDb(t)) return;
    const res = await asUser(db, fx.ids.Volunteer, `select has_allergy from public.profiles where id = $1`, [
      fx.child,
    ]);
    assert.ok(res.ok && res.rows[0]?.has_allergy === true, "the red flag vanished from the roster");
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

describe("volunteer clearance", () => {
  // is_checkin_role() gates the whole check-in surface — roster, creating
  // people at the desk, families, guardians, recording an allergy. Getting
  // enforcement wrong locks out a Sunday morning, so both directions are
  // pinned here.
  const setEnforcement = (on) =>
    db.query(`update public.checkin_settings set require_current_clearance = $1 where id = true`, [on]);
  const setExpiry = (userId, date) =>
    db.query(`update public.profiles set background_check_expires = $2 where user_id = $1`, [
      userId,
      date,
    ]);
  const hasAccess = async (userId) => {
    const r = await asUser(db, userId, `select public.is_checkin_role() as v`);
    return r.ok && r.rows[0].v === true;
  };

  test("enforcement is off by default", async (t) => {
    if (!requireDb(t)) return;
    const row = await db.query(`select require_current_clearance from public.checkin_settings`);
    assert.equal(row.rows[0]?.require_current_clearance, false, "clearance enforcement shipped ON");
  });

  test("a lapsed check does not block while enforcement is off", async (t) => {
    if (!requireDb(t)) return;
    await setEnforcement(false);
    await setExpiry(fx.ids.Volunteer, "2020-01-01");
    assert.ok(await hasAccess(fx.ids.Volunteer), "a lapsed date blocked with enforcement off");
  });

  test("a lapsed check blocks once enforcement is on", async (t) => {
    if (!requireDb(t)) return;
    await setEnforcement(true);
    await setExpiry(fx.ids.Volunteer, "2020-01-01");
    assert.equal(await hasAccess(fx.ids.Volunteer), false, "a lapsed volunteer kept check-in access");
    await setEnforcement(false);
  });

  test("nothing on file never blocks — that would lock out the whole team", async (t) => {
    if (!requireDb(t)) return;
    await setEnforcement(true);
    await setExpiry(fx.ids.Staff, null);
    assert.ok(await hasAccess(fx.ids.Staff), "a missing clearance date blocked access");
    await setEnforcement(false);
  });

  test("a current check keeps access", async (t) => {
    if (!requireDb(t)) return;
    await setEnforcement(true);
    await setExpiry(fx.ids.Volunteer, "2099-01-01");
    assert.ok(await hasAccess(fx.ids.Volunteer), "a valid clearance was rejected");
    await setEnforcement(false);
  });

  test("Super_Admin cannot lock themselves out", async (t) => {
    if (!requireDb(t)) return;
    await setEnforcement(true);
    await setExpiry(fx.ids.Super_Admin, "2020-01-01");
    assert.ok(await hasAccess(fx.ids.Super_Admin), "the person who fixes this got locked out of it");
    await setEnforcement(false);
  });

  test("nobody sets their own clearance date", async (t) => {
    if (!requireDb(t)) return;
    await setExpiry(fx.ids.Volunteer, null);
    await asUser(
      db,
      fx.ids.Volunteer,
      `update public.profiles set background_check_expires = '2099-01-01' where user_id = $1`,
      [fx.ids.Volunteer],
    );
    const row = await db.query(
      `select background_check_expires from public.profiles where user_id = $1`,
      [fx.ids.Volunteer],
    );
    assert.equal(row.rows[0]?.background_check_expires, null, "a volunteer cleared themselves");
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
