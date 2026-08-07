"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { uploadPersonPhoto, previewUrl } from "@/lib/photos";

interface ChildRow {
  key: string;
  name: string;
  dob: string;
  allergy: boolean;
  allergyNotes: string;
  photo?: File;
  photoPreview?: string;
}

let seq = 0;
const newKey = () => `c${Date.now().toString(36)}${seq++}`;

/**
 * Register a family at the check-in desk: Family → Parent 1 / Parent 2 →
 * Children.
 *
 * Everyone created here is a person WITHOUT a login (profiles.user_id is null) —
 * children never have accounts, and parents who don't use the app don't need
 * one. Both parents are recorded as authorised for pickup.
 */
export function FamilyRegister({
  campusId,
  onClose,
  onRegistered,
}: {
  campusId: string | null;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const supabase = createClient();
  const [familyName, setFamilyName] = useState("");
  const [p1Name, setP1Name] = useState("");
  const [p1Phone, setP1Phone] = useState("");
  const [p1Email, setP1Email] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p2Phone, setP2Phone] = useState("");
  const [p1Photo, setP1Photo] = useState<File | undefined>();
  const [p1Preview, setP1Preview] = useState<string>();
  const [p2Photo, setP2Photo] = useState<File | undefined>();
  const [p2Preview, setP2Preview] = useState<string>();
  const [children, setChildren] = useState<ChildRow[]>([
    { key: newKey(), name: "", dob: "", allergy: false, allergyNotes: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function updateChild(key: string, patch: Partial<ChildRow>) {
    setChildren((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const kids = children.filter((c) => c.name.trim());
    if (!p1Name.trim()) return setError("Enter at least one parent or guardian.");
    if (kids.length === 0) return setError("Add at least one child.");

    setBusy(true);
    setError(null);

    try {
      const surname =
        familyName.trim() || p1Name.trim().split(" ").slice(-1)[0] + " Family";

      // 1. Parents (no login — profiles.user_id stays null).
      const parentRows = [
        { full_name: p1Name.trim(), phone: p1Phone.trim() || null, email: p1Email.trim() || null },
        ...(p2Name.trim()
          ? [{ full_name: p2Name.trim(), phone: p2Phone.trim() || null, email: null }]
          : []),
      ].map((p) => ({ ...p, campus_id: campusId, role: "Member" as const }));

      const { data: parents, error: pErr } = await supabase
        .from("profiles")
        .insert(parentRows)
        .select("id, full_name");
      if (pErr) throw pErr;

      // 2. Children.
      const { data: kidProfiles, error: kErr } = await supabase
        .from("profiles")
        .insert(
          kids.map((c) => ({
            full_name: c.name.trim(),
            date_of_birth: c.dob || null,
            campus_id: campusId,
            role: "Member" as const,
            has_allergy: c.allergy,
            is_child: true,
          })),
        )
        .select("id, full_name");
      if (kErr) throw kErr;

      // 3. The family record, with parent 1 as primary contact.
      const parentIds = (parents ?? []).map((p) => (p as { id: string }).id);
      const { data: family, error: fErr } = await supabase
        .from("families")
        .insert({ family_name: surname, primary_contact_profile_id: parentIds[0] ?? null })
        .select("id")
        .single();
      if (fErr) throw fErr;
      const familyId = (family as { id: string }).id;

      // 4. Household membership.
      const memberRows = [
        ...parentIds.map((id) => ({
          family_id: familyId,
          profile_id: id,
          relationship_type: "Parent" as const,
        })),
        ...(kidProfiles ?? []).map((k) => ({
          family_id: familyId,
          profile_id: (k as { id: string }).id,
          relationship_type: "Child" as const,
        })),
      ];
      const { error: mErr } = await supabase.from("family_members").insert(memberRows);
      if (mErr) throw mErr;

      // 5. Pickup authorisation — a safety control, separate from household.
      const guardianRows = (kidProfiles ?? []).flatMap((k) =>
        parentIds.map((gid) => ({
          child_profile_id: (k as { id: string }).id,
          guardian_profile_id: gid,
          can_pickup: true,
        })),
      );
      if (guardianRows.length) {
        const { error: gErr } = await supabase.from("guardians").insert(guardianRows);
        if (gErr) throw gErr;
      }

      // 6. Medical notes go in the gated table, not the general profile.
      const medical = kids
        .map((c, i) => ({ c, k: (kidProfiles ?? [])[i] as { id: string } | undefined }))
        .filter((x) => x.c.allergy && x.c.allergyNotes.trim() && x.k)
        .map((x) => ({ profile_id: x.k!.id, allergies: x.c.allergyNotes.trim() }));
      if (medical.length) {
        await supabase.from("profile_medical").insert(medical);
      }

      // Photos upload last: they need the profile ids, and a failed upload
      // must never lose the registration itself.
      const photoJobs: Promise<unknown>[] = [];
      const attach = (file: File | undefined, id: string | undefined) => {
        if (!file || !id) return;
        photoJobs.push(
          uploadPersonPhoto(file, id).then((r) => {
            if ("url" in r) {
              return supabase
                .from("profiles")
                // Store the path, not the signed URL — signatures expire.
                .update({ photo_url: r.path, photo_path: r.path })
                .eq("id", id);
            }
          }),
        );
      };
      attach(p1Photo, parentIds[0]);
      attach(p2Photo, parentIds[1]);
      kids.forEach((c, i) => attach(c.photo, ((kidProfiles ?? [])[i] as { id: string } | undefined)?.id));
      await Promise.allSettled(photoJobs);

      setBusy(false);
      setDone(`${surname} registered — ${kids.length} child${kids.length === 1 ? "" : "ren"} ready to check in.`);
      onRegistered();
    } catch (err) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : "Could not register the family.";
      setError(
        /row-level security/i.test(msg)
          ? "You don't have permission to register families. Ask an admin to give you the check-in role."
          : msg,
      );
    }
  }

  if (done) {
    return (
      <Modal onClose={onClose}>
        <div className="p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            ✓
          </div>
          <p className="font-medium text-ink-900">{done}</p>
          <button
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Register a family</h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <Icon name="x" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-600">Family name</span>
          <input
            className="ah-input"
            placeholder="e.g. The Robinson Family"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
          />
        </label>

        {/* Parents */}
        <div className="rounded-xl border border-ink-100 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Parents / Guardians
          </h3>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="ah-input"
                placeholder="Parent 1 name *"
                value={p1Name}
                onChange={(e) => setP1Name(e.target.value)}
                required
              />
              <input
                className="ah-input"
                placeholder="Phone"
                value={p1Phone}
                onChange={(e) => setP1Phone(e.target.value)}
              />
              <input
                className="ah-input"
                placeholder="Email (optional)"
                value={p1Email}
                onChange={(e) => setP1Email(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="ah-input"
                placeholder="Parent 2 name"
                value={p2Name}
                onChange={(e) => setP2Name(e.target.value)}
              />
              <input
                className="ah-input"
                placeholder="Phone"
                value={p2Phone}
                onChange={(e) => setP2Phone(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <PhotoPicker
              label="Parent 1 photo"
              preview={p1Preview}
              onPick={async (f) => {
                setP1Photo(f);
                setP1Preview(await previewUrl(f));
              }}
            />
            {p2Name.trim() && (
              <PhotoPicker
                label="Parent 2 photo"
                preview={p2Preview}
                onPick={async (f) => {
                  setP2Photo(f);
                  setP2Preview(await previewUrl(f));
                }}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Both parents are authorised to pick up. Photos help confirm identity
            at pickup.
          </p>
        </div>

        {/* Children */}
        <div className="rounded-xl border border-ink-100 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Children
            </h3>
            <button
              type="button"
              onClick={() =>
                setChildren((cs) => [
                  ...cs,
                  { key: newKey(), name: "", dob: "", allergy: false, allergyNotes: "" },
                ])
              }
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              + Add child
            </button>
          </div>
          <div className="space-y-3">
            {children.map((c, i) => (
              <div key={c.key} className="rounded-lg bg-ink-50 p-2.5">
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
                  <input
                    className="ah-input"
                    placeholder={`Child ${i + 1} name`}
                    value={c.name}
                    onChange={(e) => updateChild(c.key, { name: e.target.value })}
                  />
                  <input
                    type="date"
                    className="ah-input"
                    value={c.dob}
                    onChange={(e) => updateChild(c.key, { dob: e.target.value })}
                    title="Date of birth — sets the right room"
                  />
                  {children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setChildren((cs) => cs.filter((x) => x.key !== c.key))}
                      className="self-center px-2 text-ink-300 hover:text-brand-500"
                      aria-label="Remove child"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <PhotoPicker
                    label="Photo"
                    preview={c.photoPreview}
                    onPick={async (f) =>
                      updateChild(c.key, { photo: f, photoPreview: await previewUrl(f) })
                    }
                  />
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={c.allergy}
                    onChange={(e) => updateChild(c.key, { allergy: e.target.checked })}
                  />
                  Has an allergy
                </label>
                {c.allergy && (
                  <input
                    className="ah-input mt-2"
                    placeholder="Allergy details (kept private to check-in leads)"
                    value={c.allergyNotes}
                    onChange={(e) => updateChild(c.key, { allergyNotes: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Date of birth picks the right room automatically.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {busy ? "Registering…" : "Register family"}
        </button>
      </form>
    </Modal>
  );
}

/**
 * Photo picker with a live preview. `capture` opens the camera directly on
 * phones and tablets, which is how these get taken at the desk.
 */
function PhotoPicker({
  label,
  preview,
  onPick,
}: {
  label: string;
  preview?: string;
  onPick: (f: File) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-ink-200" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-ink-100 text-ink-400">
          <Icon name="users" size={20} />
        </span>
      )}
      <span className="text-ink-600">
        <span className="block font-medium">{label}</span>
        <span className="text-xs text-brand-600 underline">
          {preview ? "Change" : "Add photo"}
        </span>
      </span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
    </label>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
