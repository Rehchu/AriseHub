"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";

export interface Field {
  id: string;
  label: string;
  field_type: "text" | "textarea" | "email" | "phone" | "select" | "checkbox" | "date";
  options: string[] | null;
  required: boolean;
  sort_order: number;
}
export interface Submission {
  id: string;
  submitter_name: string | null;
  data: Record<string, unknown>;
  created_at: string;
}
interface Form {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
}

const FIELD_TYPES: Field["field_type"][] = [
  "text",
  "textarea",
  "email",
  "phone",
  "select",
  "checkbox",
  "date",
];

export function FormBuilder({
  form,
  initialFields,
  submissions,
}: {
  form: Form;
  initialFields: Field[];
  submissions: Submission[];
}) {
  const supabase = createClient();
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [active, setActive] = useState(form.is_active);
  const [tab, setTab] = useState<"build" | "responses">("build");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<Field["field_type"]>("text");
  const [copied, setCopied] = useState(false);

  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : `/f/${form.slug}`;

  async function toggleActive() {
    const next = !active;
    setActive(next);
    await supabase.from("forms").update({ is_active: next }).eq("id", form.id);
  }

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const sort_order = fields.length;
    const { data } = await supabase
      .from("form_fields")
      .insert({
        form_id: form.id,
        label: newLabel.trim(),
        field_type: newType,
        sort_order,
        options: newType === "select" ? ["Option 1", "Option 2"] : null,
      })
      .select("*")
      .single();
    if (data) setFields((fs) => [...fs, data as Field]);
    setNewLabel("");
    setNewType("text");
  }

  async function removeField(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id));
    await supabase.from("form_fields").delete().eq("id", id);
  }

  async function toggleRequired(f: Field) {
    const required = !f.required;
    setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, required } : x)));
    await supabase.from("form_fields").update({ required }).eq("id", f.id);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <a href="/forms" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-brand-600">
        ← All forms
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">{form.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{submissions.length} responses</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-ink-600">
          <input type="checkbox" checked={active} onChange={toggleActive} />
          {active ? "Live" : "Off"}
        </label>
      </div>

      {/* Share link */}
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-teal-50 p-3">
        <Icon name="link" className="text-teal-600" />
        <input readOnly value={publicUrl} className="ah-input flex-1 bg-white text-xs" />
        <button
          onClick={() => {
            navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-6 flex gap-1 border-b border-ink-100">
        <TabBtn active={tab === "build"} onClick={() => setTab("build")}>
          Build
        </TabBtn>
        <TabBtn active={tab === "responses"} onClick={() => setTab("responses")}>
          Responses ({submissions.length})
        </TabBtn>
      </div>

      {tab === "build" ? (
        <div className="mt-5">
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3">
                <Icon name="form" size={18} className="text-ink-300" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-800">{f.label}</p>
                  <p className="text-xs capitalize text-ink-400">{f.field_type}</p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-ink-500">
                  <input type="checkbox" checked={f.required} onChange={() => toggleRequired(f)} />
                  Required
                </label>
                <button onClick={() => removeField(f.id)} className="text-ink-300 hover:text-brand-500" aria-label="Delete field">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
            {fields.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">
                No fields yet — add the first one below.
              </p>
            )}
          </div>

          <form onSubmit={addField} className="mt-4 flex flex-wrap gap-2 rounded-xl border border-ink-100 bg-ink-50 p-3">
            <input
              className="ah-input flex-1"
              placeholder="Field label (e.g. Full name)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <select
              className="ah-input w-auto capitalize"
              value={newType}
              onChange={(e) => setNewType(e.target.value as Field["field_type"])}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              Add field
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className="rounded-xl border border-ink-100 bg-white p-4">
              <p className="mb-2 text-xs text-ink-400">
                {new Date(s.created_at).toLocaleString()}
                {s.submitter_name && ` · ${s.submitter_name}`}
              </p>
              <dl className="space-y-1 text-sm">
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="font-medium text-ink-600">{k}:</dt>
                    <dd className="text-ink-800">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {submissions.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
              No responses yet. Share the link above to start collecting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {children}
    </button>
  );
}
