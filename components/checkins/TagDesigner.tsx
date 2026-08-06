"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import {
  blankDesign,
  FONTS,
  renderTagToPng,
  type TagDesign,
  type TagElement,
  type TagTemplate,
} from "@/lib/tag-design";

const SAMPLE = {
  name: "Kristina R.",
  room: "Arise Kids",
  code: "AB34",
  church: "Arise Church",
  hasAllergy: true,
};

let uid = 0;
const newId = () => `e${Date.now().toString(36)}${uid++}`;

/**
 * Drag-and-drop name tag designer. The canvas is the label at screen scale;
 * elements are positioned as fractions so a design works on any label size.
 */
export function TagDesigner({
  initial,
  onClose,
}: {
  initial: TagTemplate[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<TagTemplate[]>(initial);
  const [current, setCurrent] = useState<TagTemplate>(
    initial[0] ?? {
      id: "",
      name: "Child name tag",
      width_in: 3.5,
      height_in: 1.125,
      design: blankDesign(),
      is_default: true,
      kind: "child",
    },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; dx: number; dy: number } | null>(null);

  const PX_PER_IN = 200; // on-screen scale
  const stageW = current.width_in * PX_PER_IN;
  const stageH = current.height_in * PX_PER_IN;

  const selected = current.design.elements.find((e) => e.id === selectedId) ?? null;

  // Live preview (what actually prints).
  useEffect(() => {
    let cancelled = false;
    renderTagToPng(current, SAMPLE, 200).then((png) => {
      if (!cancelled) setPreview(png);
    });
    return () => {
      cancelled = true;
    };
  }, [current]);

  function update(patch: Partial<TagTemplate>) {
    setCurrent((c) => ({ ...c, ...patch }));
  }
  function updateDesign(patch: Partial<TagDesign>) {
    setCurrent((c) => ({ ...c, design: { ...c.design, ...patch } }));
  }
  function updateEl(id: string, patch: Partial<TagElement>) {
    setCurrent((c) => ({
      ...c,
      design: {
        ...c.design,
        elements: c.design.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      },
    }));
  }
  function addEl(kind: TagElement["kind"]) {
    const base: TagElement = {
      id: newId(),
      kind,
      x: 0.1,
      y: 0.35,
      w: kind === "line" ? 0.5 : 0.35,
      h: kind === "line" ? 0.02 : 0.2,
      ...(kind === "text"
        ? { text: "New text", fontFamily: "Poppins", fontSize: 12, color: "#0b0b0c", align: "left" as const }
        : {}),
      ...(kind === "rect" || kind === "line" ? { fill: "#d2303b", radius: 2 } : {}),
    };
    setCurrent((c) => ({ ...c, design: { ...c.design, elements: [...c.design.elements, base] } }));
    setSelectedId(base.id);
  }
  function removeEl(id: string) {
    setCurrent((c) => ({
      ...c,
      design: { ...c.design, elements: c.design.elements.filter((e) => e.id !== id) },
    }));
    setSelectedId(null);
  }

  // ---- drag / resize on the stage ----
  function onPointerDown(e: React.PointerEvent, el: TagElement, mode: "move" | "resize") {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = stageRef.current!.getBoundingClientRect();
    drag.current = {
      id: el.id,
      mode,
      dx: (e.clientX - rect.left) / rect.width - el.x,
      dy: (e.clientY - rect.top) / rect.height - el.y,
    };
    setSelectedId(el.id);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const el = current.design.elements.find((x) => x.id === d.id);
    if (!el) return;
    if (d.mode === "move") {
      updateEl(d.id, {
        x: clamp(fx - d.dx, -0.1, 1),
        y: clamp(fy - d.dy, -0.1, 1),
      });
    } else {
      updateEl(d.id, {
        w: clamp(fx - el.x, 0.03, 1.2),
        h: clamp(fy - el.y, 0.03, 1.2),
      });
    }
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const row = {
      name: current.name,
      width_in: current.width_in,
      height_in: current.height_in,
      design: current.design,
      is_default: current.is_default,
      kind: current.kind,
    };
    const res = current.id
      ? await supabase.from("nametag_templates").update(row).eq("id", current.id).select("*").single()
      : await supabase.from("nametag_templates").insert(row).select("*").single();
    setSaving(false);
    if (res.error) {
      setMsg(res.error.message);
      return;
    }
    const saved = res.data as TagTemplate;
    setCurrent(saved);
    setTemplates((ts) => {
      const rest = ts.filter((t) => t.id !== saved.id);
      return [...rest, saved];
    });
    setMsg("Saved. Check-in will use this design.");
  }

  async function uploadImage(file: File, target: "background" | "element") {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      if (target === "background") updateDesign({ backgroundImage: src });
      else {
        const el: TagElement = {
          id: newId(),
          kind: "image",
          x: 0.05,
          y: 0.3,
          w: 0.25,
          h: 0.4,
          src,
        };
        setCurrent((c) => ({ ...c, design: { ...c.design, elements: [...c.design.elements, el] } }));
        setSelectedId(el.id);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-bold text-ink-900">Name tag designer</h1>
          <div className="flex-1" />
          {templates.length > 0 && (
            <select
              className="ah-input w-auto py-1.5 text-sm"
              value={current.id}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) {
                  setCurrent(t);
                  setSelectedId(null);
                }
              }}
            >
              {!current.id && <option value="">Untitled (unsaved)</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setCurrent({
                id: "",
                name: "New tag",
                width_in: 3.5,
                height_in: 1.125,
                design: blankDesign(),
                is_default: false,
                kind: "child",
              });
              setSelectedId(null);
            }}
            className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700"
          >
            New
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="rounded-lg px-2 py-1.5 text-ink-500 hover:bg-ink-100">
            <Icon name="x" />
          </button>
        </div>

        {msg && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          {/* ---- Stage ---- */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                className="ah-input w-auto flex-1 py-1.5 text-sm"
                value={current.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Template name"
              />
              <select
                className="ah-input w-auto py-1.5 text-sm"
                value={current.kind}
                onChange={(e) => update({ kind: e.target.value as "child" | "guardian" })}
              >
                <option value="child">Child tag</option>
                <option value="guardian">Guardian pickup tag</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={current.is_default}
                  onChange={(e) => update({ is_default: e.target.checked })}
                />
                Default
              </label>
            </div>

            <div
              ref={stageRef}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onClick={() => setSelectedId(null)}
              className="relative mx-auto overflow-hidden rounded-lg border-2 border-dashed border-ink-300 bg-white shadow-sm"
              style={{
                width: stageW,
                height: stageH,
                maxWidth: "100%",
                background: current.design.background,
                backgroundImage: current.design.backgroundImage
                  ? `url(${current.design.backgroundImage})`
                  : undefined,
                backgroundSize: "cover",
              }}
            >
              {current.design.elements.map((el) => {
                const sel = el.id === selectedId;
                const common: React.CSSProperties = {
                  position: "absolute",
                  left: `${el.x * 100}%`,
                  top: `${el.y * 100}%`,
                  width: `${el.w * 100}%`,
                  height: `${el.h * 100}%`,
                  opacity: el.opacity ?? 1,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  outline: sel ? "2px solid #d2303b" : "1px dashed rgba(0,0,0,.15)",
                  cursor: "move",
                  touchAction: "none",
                };
                return (
                  <div
                    key={el.id}
                    style={common}
                    onPointerDown={(e) => onPointerDown(e, el, "move")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {el.kind === "text" && (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent:
                            el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
                          color: el.color,
                          fontFamily: `"${el.fontFamily}", system-ui, sans-serif`,
                          fontWeight: el.bold ? 700 : 400,
                          fontStyle: el.italic ? "italic" : "normal",
                          fontSize: (el.fontSize ?? 12) * (PX_PER_IN / 72) * (current.height_in / 1.125),
                          letterSpacing: el.letterSpacing ?? 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          pointerEvents: "none",
                        }}
                      >
                        {el.text}
                      </div>
                    )}
                    {(el.kind === "rect" || el.kind === "line") && (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: el.fill,
                          borderRadius: el.radius ?? 0,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {el.kind === "image" && el.src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={el.src}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                      />
                    )}
                    {sel && (
                      <span
                        onPointerDown={(e) => onPointerDown(e, el, "resize")}
                        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full bg-brand-500"
                        style={{ touchAction: "none" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <AddBtn onClick={() => addEl("text")}>+ Text</AddBtn>
              <AddBtn onClick={() => addEl("rect")}>+ Box</AddBtn>
              <AddBtn onClick={() => addEl("line")}>+ Line</AddBtn>
              <label className="cursor-pointer rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
                + Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "element")}
                />
              </label>
            </div>

            <p className="mt-3 text-xs text-ink-500">
              Placeholders: <code>{"{name}"}</code> <code>{"{room}"}</code>{" "}
              <code>{"{code}"}</code> <code>{"{date}"}</code> <code>{"{church}"}</code>{" "}
              <code>{"{allergy}"}</code> — they fill in per child at check-in.
            </p>

            {preview && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Print preview (actual output)
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Label preview" className="rounded border border-ink-200" style={{ width: stageW, maxWidth: "100%" }} />
              </div>
            )}
          </div>

          {/* ---- Inspector ---- */}
          <aside className="space-y-4">
            <Panel title="Label">
              <Row label="Width (in)">
                <input type="number" step="0.125" className="ah-input py-1 text-sm" value={current.width_in}
                  onChange={(e) => update({ width_in: Number(e.target.value) || 3.5 })} />
              </Row>
              <Row label="Height (in)">
                <input type="number" step="0.125" className="ah-input py-1 text-sm" value={current.height_in}
                  onChange={(e) => update({ height_in: Number(e.target.value) || 1.125 })} />
              </Row>
              <Row label="Background">
                <input type="color" className="h-8 w-full rounded border border-ink-200" value={current.design.background}
                  onChange={(e) => updateDesign({ background: e.target.value })} />
              </Row>
              <label className="mt-1 block cursor-pointer rounded-lg bg-ink-100 px-3 py-1.5 text-center text-sm font-medium text-ink-700">
                Background image
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "background")} />
              </label>
              {current.design.backgroundImage && (
                <button onClick={() => updateDesign({ backgroundImage: undefined })}
                  className="mt-1 w-full text-xs text-brand-600 underline">
                  Remove background image
                </button>
              )}
            </Panel>

            {selected ? (
              <Panel title={`Selected: ${selected.kind}`}>
                {selected.kind === "text" && (
                  <>
                    <Row label="Text">
                      <input className="ah-input py-1 text-sm" value={selected.text ?? ""}
                        onChange={(e) => updateEl(selected.id, { text: e.target.value })} />
                    </Row>
                    <Row label="Font">
                      <select className="ah-input py-1 text-sm" value={selected.fontFamily}
                        onChange={(e) => updateEl(selected.id, { fontFamily: e.target.value })}>
                        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </Row>
                    <Row label={`Size (${selected.fontSize}pt)`}>
                      <input type="range" min={5} max={40} value={selected.fontSize ?? 12} className="w-full"
                        onChange={(e) => updateEl(selected.id, { fontSize: Number(e.target.value) })} />
                    </Row>
                    <Row label="Colour">
                      <input type="color" className="h-8 w-full rounded border border-ink-200" value={selected.color ?? "#000000"}
                        onChange={(e) => updateEl(selected.id, { color: e.target.value })} />
                    </Row>
                    <Row label="Align">
                      <select className="ah-input py-1 text-sm" value={selected.align ?? "left"}
                        onChange={(e) => updateEl(selected.id, { align: e.target.value as "left" | "center" | "right" })}>
                        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                      </select>
                    </Row>
                    <div className="flex gap-3 text-sm text-ink-700">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!selected.bold}
                          onChange={(e) => updateEl(selected.id, { bold: e.target.checked })} /> Bold
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!selected.italic}
                          onChange={(e) => updateEl(selected.id, { italic: e.target.checked })} /> Italic
                      </label>
                    </div>
                    <Row label={`Letter spacing (${selected.letterSpacing ?? 0})`}>
                      <input type="range" min={0} max={12} value={selected.letterSpacing ?? 0} className="w-full"
                        onChange={(e) => updateEl(selected.id, { letterSpacing: Number(e.target.value) })} />
                    </Row>
                  </>
                )}
                {(selected.kind === "rect" || selected.kind === "line") && (
                  <>
                    <Row label="Fill">
                      <input type="color" className="h-8 w-full rounded border border-ink-200" value={selected.fill ?? "#d2303b"}
                        onChange={(e) => updateEl(selected.id, { fill: e.target.value })} />
                    </Row>
                    <Row label={`Corner radius (${selected.radius ?? 0})`}>
                      <input type="range" min={0} max={24} value={selected.radius ?? 0} className="w-full"
                        onChange={(e) => updateEl(selected.id, { radius: Number(e.target.value) })} />
                    </Row>
                  </>
                )}
                <Row label={`Rotation (${selected.rotation ?? 0}°)`}>
                  <input type="range" min={-180} max={180} value={selected.rotation ?? 0} className="w-full"
                    onChange={(e) => updateEl(selected.id, { rotation: Number(e.target.value) })} />
                </Row>
                <Row label={`Opacity (${((selected.opacity ?? 1) * 100).toFixed(0)}%)`}>
                  <input type="range" min={0.1} max={1} step={0.05} value={selected.opacity ?? 1} className="w-full"
                    onChange={(e) => updateEl(selected.id, { opacity: Number(e.target.value) })} />
                </Row>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={!!selected.onlyIfAllergy}
                    onChange={(e) => updateEl(selected.id, { onlyIfAllergy: e.target.checked })} />
                  Only show if child has an allergy
                </label>
                <button onClick={() => removeEl(selected.id)}
                  className="mt-2 w-full rounded-lg bg-brand-50 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
                  Delete element
                </button>
              </Panel>
            ) : (
              <Panel title="Selected">
                <p className="text-sm text-ink-400">Click an element on the label to edit it.</p>
              </Panel>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
      {children}
    </button>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-0.5 block text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}
