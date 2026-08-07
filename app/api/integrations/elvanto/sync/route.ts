import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllPeople, getAllGroups, getAllSongs, displayName, bestPhone } from "@/lib/elvanto";

// One-way sync: Elvanto → AriseHub.
//
// Elvanto is the source of truth for people and groups while both systems run,
// so this only ever reads from Elvanto and writes here. Nothing is pushed back,
// and nothing AriseHub owns (roles, departments, chat, tasks) is overwritten.
//
// Matching order: elvanto_id, then email. Anyone already linked keeps their
// AriseHub role and campus — we only refresh contact details.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  const meRow = me as { id: string; role?: string } | null;
  if (meRow?.role !== "Super_Admin" && meRow?.role !== "IT_Admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ELVANTO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Elvanto isn't connected yet — an API key hasn't been configured." },
      { status: 400 },
    );
  }

  const { dryRun } = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  const admin = createAdminClient();

  const { data: runRow } = await admin
    .from("elvanto_syncs")
    .insert({ triggered_by: meRow.id, notes: dryRun ? "dry run" : null })
    .select("id")
    .single();
  const runId = (runRow as { id: string } | null)?.id;

  const errors: string[] = [];
  let peopleCreated = 0;
  let peopleUpdated = 0;
  let groupsCreated = 0;
  let groupsUpdated = 0;

  try {
    // ---------- People ----------
    const people = await getAllPeople(apiKey);

    // Existing records, indexed for matching.
    const { data: existing } = await admin
      .from("profiles")
      .select("id, elvanto_id, email");
    const byElvanto = new Map<string, string>();
    const byEmail = new Map<string, string>();
    for (const p of (existing ?? []) as {
      id: string;
      elvanto_id: string | null;
      email: string | null;
    }[]) {
      if (p.elvanto_id) byElvanto.set(p.elvanto_id, p.id);
      if (p.email) byEmail.set(p.email.toLowerCase(), p.id);
    }

    for (const person of people) {
      // Archived people in Elvanto shouldn't appear in the directory.
      const archived = (person.status ?? "").toLowerCase() === "archived";
      const email = (person.email ?? "").trim().toLowerCase() || null;
      const existingId =
        byElvanto.get(person.id) ?? (email ? byEmail.get(email) : undefined);

      // Contact details only — never role or campus, which AriseHub owns.
      const fields = {
        full_name: displayName(person),
        email,
        phone: bestPhone(person),
        date_of_birth: person.date_of_birth || null,
        elvanto_id: person.id,
        archived_at: archived ? new Date().toISOString() : null,
      };

      if (dryRun) {
        if (existingId) peopleUpdated++;
        else peopleCreated++;
        continue;
      }

      if (existingId) {
        const { error } = await admin.from("profiles").update(fields).eq("id", existingId);
        if (error) errors.push(`update ${fields.full_name}: ${error.message}`);
        else peopleUpdated++;
      } else {
        // New arrivals come in as Members with no login — an invite link is
        // still what gives someone an account.
        const { error } = await admin
          .from("profiles")
          .insert({ ...fields, role: "Member" });
        if (error) errors.push(`create ${fields.full_name}: ${error.message}`);
        else peopleCreated++;
      }
    }

    // ---------- Groups ----------
    try {
      const groups = await getAllGroups(apiKey);
      const { data: existingGroups } = await admin
        .from("groups")
        .select("id, elvanto_id");
      const gByElvanto = new Map<string, string>();
      for (const g of (existingGroups ?? []) as { id: string; elvanto_id: string | null }[]) {
        if (g.elvanto_id) gByElvanto.set(g.elvanto_id, g.id);
      }

      for (const g of groups) {
        const fields = {
          name: g.name,
          description: g.description || null,
          elvanto_id: g.id,
        };
        if (dryRun) {
          gByElvanto.has(g.id) ? groupsUpdated++ : groupsCreated++;
          continue;
        }
        const existingGid = gByElvanto.get(g.id);
        if (existingGid) {
          const { error } = await admin.from("groups").update(fields).eq("id", existingGid);
          if (error) errors.push(`group ${g.name}: ${error.message}`);
          else groupsUpdated++;
        } else {
          const { error } = await admin
            .from("groups")
            .insert({ ...fields, group_type: "small_group", is_open: false });
          if (error) errors.push(`group ${g.name}: ${error.message}`);
          else groupsCreated++;
        }
      }
    } catch (e) {
      errors.push(`groups: ${e instanceof Error ? e.message : "failed"}`);
    }

    // ---------- Songs ----------
    try {
      const songs = await getAllSongs(apiKey);
      const { data: existingSongs } = await admin.from("songs").select("id, elvanto_id");
      const sByElvanto = new Map<string, string>();
      for (const s of (existingSongs ?? []) as { id: string; elvanto_id: string | null }[]) {
        if (s.elvanto_id) sByElvanto.set(s.elvanto_id, s.id);
      }
      for (const song of songs) {
        const arr = song.arrangements?.arrangement?.[0];
        const fields = {
          title: song.title,
          artist: song.artist || null,
          ccli_number: song.ccli_number || null,
          default_key: arr?.key || null,
          bpm: arr?.bpm
            ? Number(arr.bpm) || null
            : song.bpm
              ? Number(song.bpm) || null
              : null,
          elvanto_id: song.id,
        };
        if (dryRun) continue;
        const existingSid = sByElvanto.get(song.id);
        const res = existingSid
          ? await admin.from("songs").update(fields).eq("id", existingSid)
          : await admin.from("songs").insert(fields);
        if (res.error) errors.push("song " + song.title + ": " + res.error.message);
      }
    } catch (e) {
      errors.push("songs: " + (e instanceof Error ? e.message : "failed"));
    }

    const status = errors.length === 0 ? "success" : "partial";
    if (runId) {
      await admin
        .from("elvanto_syncs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          people_created: peopleCreated,
          people_updated: peopleUpdated,
          groups_created: groupsCreated,
          groups_updated: groupsUpdated,
          errors: errors.slice(0, 50),
        })
        .eq("id", runId);
    }

    return NextResponse.json({
      ok: true,
      dryRun: !!dryRun,
      status,
      peopleCreated,
      peopleUpdated,
      groupsCreated,
      groupsUpdated,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sync failed";
    if (runId) {
      await admin
        .from("elvanto_syncs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          errors: [message],
        })
        .eq("id", runId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
