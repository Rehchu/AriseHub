// Minimal Elvanto REST client.
//
// The official PHP library (elvanto/api-php) was archived in Nov 2023, so this
// talks to the REST API directly. Auth is HTTP Basic with the API key as the
// username and any value as the password.
//
// Docs: https://www.elvanto.com/api/

const BASE = "https://api.elvanto.com/v1";

export interface ElvantoPerson {
  id: string;
  firstname?: string;
  lastname?: string;
  preferred_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  date_of_birth?: string;
  gender?: string;
  status?: string; // Active | Archived etc.
  family_id?: string;
  family_relationship?: string;
  location_name?: string;
  [key: string]: unknown;
}

export interface ElvantoSong {
  id: string;
  title: string;
  artist?: string;
  ccli_number?: string;
  bpm?: string | number;
  arrangements?: { arrangement?: { id: string; title?: string; key?: string; bpm?: string }[] };
  [key: string]: unknown;
}

export interface ElvantoGroup {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface ElvantoError {
  error?: { code?: number; message?: string };
}

async function call<T>(
  apiKey: string,
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${BASE}/${endpoint}.json`, {
    method: "POST",
    headers: {
      // API key as username, password ignored.
      Authorization: `Basic ${btoa(`${apiKey}:x`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Elvanto ${endpoint} failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as T & ElvantoError;
  if (body.error) {
    throw new Error(
      `Elvanto ${endpoint} error ${body.error.code ?? ""}: ${body.error.message ?? "unknown"}`,
    );
  }
  return body;
}

/**
 * Fetch every person, following Elvanto's paging (it caps page_size at 1000).
 * `fields` pulls the extras that aren't returned by default.
 */
export async function getAllPeople(apiKey: string): Promise<ElvantoPerson[]> {
  const out: ElvantoPerson[] = [];
  let page = 1;
  const pageSize = 500;

  // Guard against a runaway loop if the API ever misreports totals.
  for (let guard = 0; guard < 50; guard++) {
    const body = await call<{
      people?: { person?: ElvantoPerson[]; on_this_page?: number; total?: number };
    }>(apiKey, "people/getAll", {
      page,
      page_size: pageSize,
      fields: ["family", "date_of_birth", "gender", "location"],
    });

    const batch = body.people?.person ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    page++;
  }
  return out;
}

export async function getAllGroups(apiKey: string): Promise<ElvantoGroup[]> {
  const body = await call<{ groups?: { group?: ElvantoGroup[] } }>(
    apiKey,
    "groups/getAll",
    { page_size: 500 },
  );
  return body.groups?.group ?? [];
}

/**
 * Fetch the song library. Elvanto keys/BPM live on arrangements, so we take the
 * first arrangement as the default — enough for a plan, and the team can adjust
 * per service.
 */
export async function getAllSongs(apiKey: string): Promise<ElvantoSong[]> {
  const out: ElvantoSong[] = [];
  let page = 1;
  const pageSize = 500;
  for (let guard = 0; guard < 20; guard++) {
    const body = await call<{ songs?: { song?: ElvantoSong[] } }>(apiKey, "songs/getAll", {
      page,
      page_size: pageSize,
      fields: ["arrangements"],
    });
    const batch = body.songs?.song ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    page++;
  }
  return out;
}

/** Cheap credential check for the settings screen. */
export async function testConnection(
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await call(apiKey, "people/getAll", { page: 1, page_size: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "connection failed" };
  }
}

/** Elvanto splits names; AriseHub stores one display name. */
export function displayName(p: ElvantoPerson): string {
  const first = (p.preferred_name || p.firstname || "").trim();
  const last = (p.lastname || "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unnamed";
}

export function bestPhone(p: ElvantoPerson): string | null {
  return (p.mobile || p.phone || "").trim() || null;
}
