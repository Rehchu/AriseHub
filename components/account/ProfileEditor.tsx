"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import { useSignedUrl } from "@/lib/storage-url";
import { uploadImageWithThumb } from "@/lib/upload";

export interface MyProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  birthday: string | null;
  address: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  role: string;
  title: string | null;
  campus: string | null;
  departments: string[];
}

/**
 * Everyone maintains their own profile here. Name, email and phone are
 * required — the church needs to be able to reach you. Everything else is
 * optional.
 *
 * Role, ministry title and campus are deliberately read-only: the database
 * ignores changes to them from your own account (see 0028), so showing them as
 * editable would just be a lie.
 */
export function ProfileEditor({ profile }: { profile: MyProfile }) {
  const supabase = createClient();
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    bio: profile.bio ?? "",
    birthday: profile.birthday ?? "",
    address: profile.address ?? "",
    emergency_contact: profile.emergency_contact ?? "",
    emergency_phone: profile.emergency_phone ?? "",
  });
  const [photo, setPhoto] = useState(profile.photo_url);
  const photoSrc = useSignedUrl(["attachments", "photos"], photo);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.full_name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!name) return setError("Your name is required.");
    if (!email) return setError("An email address is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("That email address doesn't look right.");
    // Loose on purpose — people write numbers in all sorts of ways.
    if (phone.replace(/\D/g, "").length < 10) return setError("A phone number with at least 10 digits is required.");

    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: name,
        email,
        phone,
        bio: form.bio.trim() || null,
        birthday: form.birthday || null,
        address: form.address.trim() || null,
        emergency_contact: form.emergency_contact.trim() || null,
        emergency_phone: form.emergency_phone.trim() || null,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    // Compress first — phone photos are multi-megabyte and this used to store
    // them whole, which was slow to load and ate the storage quota.
    const up = await uploadImageWithThumb(file, "profiles", 900);
    if ("error" in up) {
      setBusy(false);
      return setError(up.error);
    }
    const { error } = await supabase
      .from("profiles")
      .update({ photo_url: up.ref })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return setError(error.message);
    setPhoto(up.ref);
  }

  const initials = profile.full_name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">My profile</h1>
      <p className="mt-1 text-ink-500">
        Keep your details current so the church can reach you.
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-4">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700">
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-medium text-ink-900">
            {profile.title || profile.role.replace("_", " ")}
            {profile.campus && ` · ${profile.campus}`}
          </p>
          {profile.departments.length > 0 && (
            <p className="truncate text-xs text-ink-500">{profile.departments.join(" · ")}</p>
          )}
          <label className="mt-1 inline-block cursor-pointer text-sm font-medium text-brand-600 hover:underline">
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
          </label>
        </div>
      </div>

      <form onSubmit={save} className="mt-4 space-y-4 rounded-xl border border-ink-100 bg-white p-4">
        <Field label="Full name" required>
          <input className="ah-input" value={form.full_name} onChange={set("full_name")} autoComplete="name" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required>
            <input className="ah-input" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
          </Field>
          <Field label="Phone" required>
            <input className="ah-input" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          </Field>
        </div>

        <Field label="About me" hint="Shown on your profile in the church directory.">
          <textarea
            className="ah-input min-h-24"
            value={form.bio}
            onChange={set("bio")}
            placeholder="A sentence or two — how long you've been at Arise, what you serve in, anything you'd like people to know."
            maxLength={600}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Birthday">
            <input className="ah-input" type="date" value={form.birthday} onChange={set("birthday")} />
          </Field>
          <Field label="Address">
            <input className="ah-input" value={form.address} onChange={set("address")} autoComplete="street-address" />
          </Field>
        </div>

        <fieldset className="rounded-lg bg-ink-50 p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Emergency contact
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className="ah-input" value={form.emergency_contact} onChange={set("emergency_contact")} />
            </Field>
            <Field label="Phone">
              <input className="ah-input" type="tel" value={form.emergency_phone} onChange={set("emergency_phone")} />
            </Field>
          </div>
        </fieldset>

        <p className="flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
          <Icon name="lock" size={14} />
          <span>
            Your contact details, birthday, address and emergency contact are
            visible only to leadership — pastors, admins, staff and your
            department leads. Other members see your name, photo and bio.
          </span>
        </p>

        {error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save profile"}
          </button>
          {saved && <span className="text-sm font-medium text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-600">
        {label}
        {required && <span className="ml-1 text-brand-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}
