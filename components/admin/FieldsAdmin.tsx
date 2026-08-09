"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PersonField {
  id: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "checkbox";
  options: string[] | null;
  sort_order: number;
}

const TYPES: PersonField["field_type"][] = ["text", "number", "date", "select", "checkbox"];

export function FieldsAdmin({ initial }: { initial: PersonField[] }) {
  const supabase = createClient();
  const [fields, setFields] = useState<PersonField[]>(initial);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<PersonField["field_type"]>("text");
  const [opts, setOpts] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    const options =
      type === "select"
        ? opts.split(",").map((o) => o.trim()).filter(Boolean)
        : null;
    const { data, error } = await supabase
      .from("person_fields")
      .insert({ label: label.trim(), field_type: type, options, sort_order: fields.length })
      .select("*")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setFields((f) => [...f, data as PersonField]);
    setLabel("");
    setType("text");
    setOpts("");
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this field and all its stored values?")) return;
    setFields((f) => f.filter((x) => x.id !== id));
    await supabase.from("person_fields").delete().eq("id", id);
  }

  return (
    <div>
      <p className="mb-4 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
        Define extra fields to track on people (e.g. &quot;Baptism date&quot;,
        &quot;T-shirt size&quot;, &quot;Serving interest&quot;). Set values per person on
        the People tab.
      </p>

      <form onSubmit={add} className="mb-6 space-y-2 rounded-xl border border-ink-100 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input className="ah-input flex-1" placeholder="Field label (e.g. Baptism date)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select className="ah-input w-auto capitalize" value={type} onChange={(e) => setType(e.target.value as PersonField["field_type"])}>
            {TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60">
            Add field
          </button>
        </div>
        {type === "select" && (
          <input className="ah-input" placeholder="Options, comma-separated (e.g. S, M, L, XL)" value={opts} onChange={(e) => setOpts(e.target.value)} />
        )}
      </form>

      {error && <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{error}</p>}

      <div className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
        {fields.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{f.label}</p>
              {f.options && f.options.length > 0 && (
                <p className="truncate text-xs text-ink-400">{f.options.join(", ")}</p>
              )}
            </div>
            <span className="rounded bg-ink-100 px-2 py-0.5 text-[11px] capitalize text-ink-600">
              {f.field_type}
            </span>
            <button onClick={() => remove(f.id)} className="rounded px-2 py-1 text-[13px] font-medium text-brand-600 hover:bg-brand-50">
              Delete
            </button>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-400">No custom fields yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
