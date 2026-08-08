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
