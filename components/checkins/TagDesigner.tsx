"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shell/Icon";
import {
  blankDesign,
  elementVisible,
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  loadFont,
  LABEL_PRESETS,
  MERGE_FIELDS,
  newElementId,
  PRINT_DPI,
  renderTagToPng,
  type TagDesign,
  type TagElement,
  type TagTemplate,
} from "@/lib/tag-design";
import { hitsElement } from "@/lib/hit-test";
import {
  CLIPART,
  CLIPART_CATEGORIES,
  clipArtDataUrl,
  type ClipArt,
} from "@/lib/clipart";

const SAMPLE = {
  name: "Kristina R.",
  room: "Arise Kids",
  code: "AB34",
  church: "Arise Church",
  campus: "Main Campus",
  guardian: "Dana R.",
  service: "10:30 Service",
  age: 6,
  hasAllergy: true,
};

const BASE_PX_PER_IN = 200; // on-screen scale at 100% zoom
const MAX_HISTORY = 60;

function emptyTemplate(): TagTemplate {
  return {
    id: "",
    name: "New tag",
    width_in: 3.5,
    height_in: 1.125,
    design: blankDesign(),
    is_default: false,
    kind: "child",
  };
}

/**
 * Drag-and-drop name tag designer. The canvas is the label at screen scale;
 * elements are positioned as fractions so a design works on any label size.
 *
 * Screen scaling mirrors the renderer exactly: fontSize is pt scaled by label
 * height, and every other length is px-at-96dpi scaled by the stage's px/in.
 * Get that wrong and the stage stops being a preview.
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
  const [current, setCurrent] = useState<TagTemplate>(initial[0] ?? emptyTemplate());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artOpen, setArtOpen] = useState(false);
  const [artCat, setArtCat] = useState<ClipArt["category"]>("faith");
  const [artColor, setArtColor] = useState("#d2303b");
  const [preview, setPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  // On by default. You are laying things out on a 3.5in label — the grid is the
  // whole reason the result comes out straight, and off-by-default meant nobody
  // knew it existed.
  const [showGrid, setShowGrid] = useState(true);

  const [past, setPast] = useState<TagTemplate[]>([]);
  const [future, setFuture] = useState<TagTemplate[]>([]);
  const savedSnapshot = useRef<string>(JSON.stringify(initial[0] ?? emptyTemplate()));
  const clipboard = useRef<TagElement | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; dx: number; dy: number } | null>(null);

  const PX_PER_IN = BASE_PX_PER_IN * zoom;
  const stageW = current.width_in * PX_PER_IN;
  const stageH = current.height_in * PX_PER_IN;
  // The renderer scales px-at-96dpi lengths by dpi/96; on screen the stage's
  // px-per-inch plays the part of dpi.
  const pxScale = PX_PER_IN / 96;
  const ptScale = (PX_PER_IN / 72) * (current.height_in / 1.125);

  const selected = current.design.elements.find((e) => e.id === selectedId) ?? null;
  const dirty = useMemo(() => JSON.stringify(current) !== savedSnapshot.current, [current]);

  // ---- history -------------------------------------------------------------
  // Snapshots are taken when an interaction STARTS, not on every value change,
  // so dragging a slider is one undo step rather than forty.
  const pushHistory = useCallback(() => {
    setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), current]);
    setFuture([]);
  }, [current]);

  // Selection survives undo/redo. Both used to clear it, so stepping back one
  // nudge threw away what you were working on and collapsed the properties
  // panel. `selected` is derived by id lookup, so if the step removed the
  // element it falls to null on its own.
  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [current, ...f].slice(0, MAX_HISTORY));
      setCurrent(prev);
      return p.slice(0, -1);
    });
  }, [current]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      setPast((p) => [...p, current]);
      setCurrent(f[0]);
      return f.slice(1);
    });
  }, [current]);

  // ---- live preview --------------------------------------------------------
  // Debounced: this rasterises the whole label at print DPI, and it used to run
  // on every single pointermove during a drag.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      renderTagToPng(current, SAMPLE, PRINT_DPI).then((png) => {
        if (!cancelled) setPreview(png);
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [current]);

  // Losing a design to a stray tab close is not recoverable — there is no draft.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
  function setElements(fn: (els: TagElement[]) => TagElement[]) {
    setCurrent((c) => ({ ...c, design: { ...c.design, elements: fn(c.design.elements) } }));
  }

  function addEl(kind: TagElement["kind"]) {
    pushHistory();
    const base: TagElement = {
      id: newElementId(),
      kind,
      x: 0.1,
      y: 0.35,
      w: kind === "line" ? 0.5 : kind === "qr" ? 0.22 : 0.35,
      h: kind === "line" ? 0.02 : kind === "qr" ? 0.62 : 0.2,
      ...(kind === "text"
        ? {
            text: "New text",
            fontFamily: "Poppins",
            fontSize: 12,
            color: "#0b0b0c",
            align: "left" as const,
          }
        : {}),
      ...(kind === "rect" || kind === "line" ? { fill: "#d2303b", radius: 2 } : {}),
      ...(kind === "qr" || kind === "barcode"
        ? { codeValue: "{code}", color: "#0b0b0c", ...(kind === "barcode" ? { showCodeText: true } : {}) }
        : {}),
    };
    setElements((els) => [...els, base]);
    setSelectedId(base.id);
  }

  // Clip art is added as an image element backed by an inline SVG data URL,
  // so it scales and prints cleanly and can be recoloured on insert.
  function addArt(art: ClipArt) {
    pushHistory();
    const el: TagElement = {
      id: newElementId(),
      kind: "image",
      name: art.label,
      x: 0.06,
      y: 0.25,
      w: 0.2,
      h: 0.45,
      src: clipArtDataUrl(art, artColor),
    };
    setElements((els) => [...els, el]);
    setSelectedId(el.id);
    setArtOpen(false);
  }

  function removeEl(id: string) {
    const el = current.design.elements.find((e) => e.id === id);
    if (el?.locked) return;
    pushHistory();
    setElements((els) => els.filter((e) => e.id !== id));
    setSelectedId(null);
  }

  function duplicateEl(id: string) {
    const el = current.design.elements.find((e) => e.id === id);
    if (!el) return;
    pushHistory();
    const copy: TagElement = {
      ...el,
      id: newElementId(),
      x: Math.min(0.95, el.x + 0.03),
      y: Math.min(0.95, el.y + 0.03),
    };
    setElements((els) => [...els, copy]);
    setSelectedId(copy.id);
  }

  /** Move an element in the draw order. Later in the array = drawn on top. */
  function reorder(id: string, to: "front" | "back" | "up" | "down") {
    pushHistory();
    setElements((els) => {
      const i = els.findIndex((e) => e.id === id);
      if (i === -1) return els;
      const next = [...els];
      const [el] = next.splice(i, 1);
      if (to === "front") next.push(el);
      else if (to === "back") next.unshift(el);
      else if (to === "up") next.splice(Math.min(next.length, i + 1), 0, el);
      else next.splice(Math.max(0, i - 1), 0, el);
      return next;
    });
  }

  function alignEl(id: string, how: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    const el = current.design.elements.find((e) => e.id === id);
    if (!el) return;
    pushHistory();
    const patch: Partial<TagElement> =
      how === "left" ? { x: 0 }
      : how === "right" ? { x: Math.max(0, 1 - el.w) }
      : how === "hcenter" ? { x: Math.max(0, (1 - el.w) / 2) }
      : how === "top" ? { y: 0 }
      : how === "bottom" ? { y: Math.max(0, 1 - el.h) }
      : { y: Math.max(0, (1 - el.h) / 2) };
    updateEl(id, patch);
  }

  function insertMergeField(token: string) {
    pushHistory();
    // Append to the selected text box if there is one. Otherwise CREATE one —
    // clicking a merge field with nothing selected used to do nothing at all,
    // so the chips could only ever merge into an existing box and never add a
    // field, which is the obvious thing to want from a row of field buttons.
    if (selected && selected.kind === "text") {
      updateEl(selected.id, { text: `${selected.text ?? ""}${token}` });
      return;
    }
    const el: TagElement = {
      id: newElementId(),
      kind: "text",
      // Dropped clear of the existing rows rather than on top of them.
      x: 0.08,
      y: Math.min(0.8, 0.12 + current.design.elements.length * 0.06),
      w: 0.4,
      h: 0.16,
      text: token,
      fontFamily: "Poppins",
      fontSize: 12,
      color: "#0b0b0c",
      align: "left",
    };
    setElements((els) => [...els, el]);
    setSelectedId(el.id);
  }

  /**
   * Shrink a text box to hug its glyphs.
   *
   * A text element is sized to the slot it was drawn in, not to its text — the
   * stock template's {church} and {name} are both 92% wide for text that inks
   * about a third of that. An oversized box is what makes an element feel stuck
   * when you drag it, so this is the one-click way out.
   */
  function fitToContent(el: TagElement) {
    if (el.kind !== "text") return;
    const stage = stageRef.current;
    const node = stage?.querySelector<HTMLElement>(`[data-el-id="${el.id}"] > div`);
    if (!stage || !node) return;
    const cs = getComputedStyle(node);
    const probe = document.createElement("span");
    probe.style.cssText =
      `position:absolute;visibility:hidden;white-space:pre;left:-9999px;` +
      `font:${cs.font};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform}`;
    probe.textContent = node.textContent ?? "";
    document.body.appendChild(probe);
    const inkW = probe.offsetWidth;
    const inkH = probe.offsetHeight;
    probe.remove();
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height || !inkW) return;
    // A hair of slack so the last glyph is never clipped by a rounding error.
    const w = Math.max(MIN_SIZE, (inkW + 2) / rect.width);
    const h = Math.max(MIN_SIZE, Math.max(inkH + 2, parseFloat(cs.fontSize) * 1.35) / rect.height);
    updateEl(el.id, { w, h, x: clampX(el.x, w), y: clampY(el.y, h) });
  }

  // ---- drag / resize on the stage ------------------------------------------
  // Snapping defaults ON — `?? true`, not `?? false`. Straight is what you want
  // on a printed label, and Snap in the toolbar turns it off when you don't.
  const snapOn = current.design.snapToGrid ?? true;
  const snap = useCallback(
    (v: number) => {
      const g = current.design.gridSize ?? 0.025;
      return (current.design.snapToGrid ?? true) ? Math.round(v / g) * g : v;
    },
    [current.design.gridSize, current.design.snapToGrid],
  );

  /**
   * Which element does a click at this point mean?
   *
   * An element's hit area is its whole box, transparent parts included — so a
   * sparkle whose box overlaps {name} swallowed every click meant for the text
   * underneath, and the only way to reach it was the layers list. Measured on
   * the live board: 3 of 8 elements were unreachable this way.
   *
   * Clicking the same spot again walks DOWN the stack, so everything under the
   * pointer is reachable in turn — the standard behaviour in a layout tool.
   */
  function pickAt(fx: number, fy: number, currentId: string | null): TagElement | null {
    const stage = stageRef.current;
    // hitsElement asks the PIXELS for images: a sparkle is mostly transparent,
    // and its empty corners should let a click through to whatever is beneath.
    // Text, boxes, lines and codes are solid, and anything unsampleable falls
    // back to its box.
    let under = current.design.elements.filter(
      (el) => !el.hidden && !el.locked && hitsElement(el, fx, fy, stage),
    );
    // If the ink test excluded everything, fall back to plain boxes rather than
    // leaving the click doing nothing — clicking near a thin line should still
    // grab it.
    if (under.length === 0) {
      under = current.design.elements.filter(
        (el) =>
          !el.hidden &&
          !el.locked &&
          fx >= Math.min(el.x, el.x + el.w) &&
          fx <= Math.max(el.x, el.x + el.w) &&
          fy >= Math.min(el.y, el.y + el.h) &&
          fy <= Math.max(el.y, el.y + el.h),
      );
    }
    if (under.length === 0) return null;
    // Last in the array paints on top, so search topmost-first.
    const top = [...under].reverse();
    const at = top.findIndex((el) => el.id === currentId);
    return at === -1 ? top[0] : top[(at + 1) % top.length];
  }

  function onPointerDown(e: React.PointerEvent, el: TagElement, mode: "move" | "resize") {
    if (el.locked) return;
    e.stopPropagation();
    // Capture on the STAGE, not the element: capturing on the element meant a
    // fast drag that outran the pointer dropped the gesture entirely.
    //
    // Guarded, because this throws if the pointer is no longer active — and it
    // ran BEFORE drag.current was set, so a throw here left the element selected
    // and completely undraggable, with nothing in the console to say why.
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimisation for fast drags, not a requirement.
    }
    const rect = stageRef.current!.getBoundingClientRect();
    pushHistory();
    // For a move, the offset is pointer-minus-origin. For a resize it is
    // pointer-minus-CORNER, so the box keeps its size at the moment you grab it
    // instead of snapping to wherever the pointer happens to be. The handle sits
    // inside the element, so the old absolute maths shrank the box by the
    // handle's own width the instant you touched it — and on a small element
    // that collapsed it to the minimum and looked like it vanished.
    drag.current = {
      id: el.id,
      mode,
      dx:
        (e.clientX - rect.left) / rect.width - (mode === "resize" ? el.x + el.w : el.x),
      dy:
        (e.clientY - rect.top) / rect.height - (mode === "resize" ? el.y + el.h : el.y),
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
    movedDuringDrag.current = true;
    if (d.mode === "move") {
      updateEl(d.id, {
        x: snap(clampX(fx - d.dx, el.w)),
        y: snap(clampY(fy - d.dy, el.h)),
      });
    } else {
      // Resize may run past the edge for the same reason a move may — the
      // overhang is clipped, not printed. The grab offset keeps the corner under
      // the pointer rather than jumping to it.
      updateEl(d.id, {
        w: snap(Math.max(MIN_SIZE, fx - d.dx - el.x)),
        h: snap(Math.max(MIN_SIZE, fy - d.dy - el.y)),
      });
    }
  }

  function endDrag() {
    drag.current = null;
  }

  /**
   * Did the pointer actually move during this gesture?
   *
   * The browser fires a `click` when the pointer goes up, and after a drag that
   * click lands on the STAGE rather than on the element you were dragging — so
   * the stage's "click empty space to deselect" handler fired and the thing you
   * had just finished positioning deselected itself, taking the whole properties
   * panel with it.
   */
  const movedDuringDrag = useRef(false);

  // ---- keyboard ------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;

      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (!selected) return;

      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateEl(selected.id);
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        clipboard.current = selected;
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (!clipboard.current) return;
        e.preventDefault();
        pushHistory();
        const copy: TagElement = {
          ...clipboard.current,
          id: newElementId(),
          x: Math.min(0.95, clipboard.current.x + 0.03),
          y: Math.min(0.95, clipboard.current.y + 0.03),
        };
        setElements((els) => [...els, copy]);
        setSelectedId(copy.id);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeEl(selected.id);
        return;
      }
      const step = e.shiftKey ? 0.05 : 0.005;
      // Same containment as dragging — the keyboard and the mouse must not
      // disagree about where an element is allowed to be.
      const nudge: Record<string, Partial<TagElement>> = {
        ArrowLeft: { x: clampX(selected.x - step, selected.w) },
        ArrowRight: { x: clampX(selected.x + step, selected.w) },
        ArrowUp: { y: clampY(selected.y - step, selected.h) },
        ArrowDown: { y: clampY(selected.y + step, selected.h) },
      };
      if (nudge[e.key]) {
        e.preventDefault();
        if (selected.locked) return;
        updateEl(selected.id, nudge[e.key]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, undo, redo, pushHistory]);

  // ---- persistence ---------------------------------------------------------
  function confirmDiscard(): boolean {
    if (!dirty) return true;
    return window.confirm("This template has unsaved changes. Discard them?");
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
      // RLS rejections read as gibberish to a volunteer; say what it means.
      const m = /row-level security|permission denied/i.test(res.error.message)
        ? "You don't have permission to change name tag templates — ask an admin."
        : res.error.message;
      setMsg({ text: m, bad: true });
      return;
    }
    const saved = res.data as TagTemplate;
    setCurrent(saved);
    savedSnapshot.current = JSON.stringify(saved);
    // Keep list order stable — replacing in place stops the picker reshuffling
    // under the user every time they save.
    setTemplates((ts) =>
      ts.some((t) => t.id === saved.id) ? ts.map((t) => (t.id === saved.id ? saved : t)) : [...ts, saved],
    );
    setMsg({ text: "Saved. Check-in will use this design." });
  }

  useEffect(() => {
    if (!msg || msg.bad) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  async function deleteTemplate() {
    if (!current.id) return;
    if (!window.confirm(`Delete "${current.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from("nametag_templates").delete().eq("id", current.id);
    if (error) {
      setMsg({ text: error.message, bad: true });
      return;
    }
    const rest = templates.filter((t) => t.id !== current.id);
    setTemplates(rest);
    const next = rest[0] ?? emptyTemplate();
    setCurrent(next);
    savedSnapshot.current = JSON.stringify(next);
    setSelectedId(null);
  }

  function duplicateTemplate() {
    const copy: TagTemplate = {
      ...current,
      id: "",
      name: `${current.name} copy`,
      is_default: false,
      // Fresh ids, or edits to the copy would land on the original's elements.
      design: {
        ...current.design,
        elements: current.design.elements.map((e) => ({ ...e, id: newElementId() })),
      },
    };
    setCurrent(copy);
    savedSnapshot.current = "";
    setSelectedId(null);
  }

  /**
   * The church logo, stored once and reused on every template.
   *
   * The flame mark goes on every badge, and "+ Image" meant finding the file
   * again for each template on each device. Loaded here, dropped with one tap.
   */
  const [churchLogo, setChurchLogo] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("church_logo_url")
      .maybeSingle()
      .then(({ data }) => setChurchLogo((data as { church_logo_url: string | null } | null)?.church_logo_url ?? null));
  }, [supabase]);

  function addLogo() {
    if (!churchLogo) return;
    pushHistory();
    const el: TagElement = {
      id: newElementId(),
      kind: "image",
      name: "Church logo",
      x: 0.04,
      y: 0.08,
      w: 0.16,
      h: 0.5,
      src: churchLogo,
      fit: "contain",
    };
    setElements((els) => [...els, el]);
    setSelectedId(el.id);
  }

  /** Remember the selected image as THE church logo. Super admins only (RLS). */
  async function saveAsChurchLogo(src: string) {
    const { data, error } = await supabase
      .from("app_settings")
      .update({ church_logo_url: src, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("id");
    // RLS refusing a row returns no rows and no error, which an unchecked update
    // cannot tell from success.
    if (error || !data?.length) {
      setMsg({
        text: error?.message ?? "Only a super admin can set the church logo.",
        bad: true,
      });
      return;
    }
    setChurchLogo(src);
    setMsg({ text: "Saved as the church logo — it's one tap on any template now." });
  }

  async function uploadImage(file: File, target: "background" | "element") {
    // Designs live in a jsonb column and images are inlined as data URLs, so an
    // unbounded upload becomes an unbounded row that every check-in station then
    // downloads on every print.
    if (file.size > 400_000) {
      setMsg({
        text: `That image is ${(file.size / 1024).toFixed(0)}KB. Please use one under 400KB — labels print at 300dpi, so small images are plenty.`,
        bad: true,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      pushHistory();
      if (target === "background") updateDesign({ backgroundImage: src });
      else {
        const el: TagElement = {
          id: newElementId(),
          kind: "image",
          name: file.name,
          x: 0.05,
          y: 0.3,
          w: 0.25,
          h: 0.4,
          src,
        };
        setElements((els) => [...els, el]);
        setSelectedId(el.id);
      }
    };
    reader.readAsDataURL(file);
  }

  const gridSize = current.design.gridSize ?? 0.025;
  /** The black-and-white print preview. Artwork only — never editor chrome. */
  const artFilter = current.design.monochrome ? "grayscale(1) contrast(3)" : undefined;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-bold text-ink-900">Name tag designer</h1>
          {dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Unsaved</span>}
          <div className="flex-1" />
          {templates.length > 0 && (
            <select
              className="ah-input w-auto py-1.5 text-sm"
              value={current.id}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (!t || !confirmDiscard()) return;
                setCurrent(t);
                savedSnapshot.current = JSON.stringify(t);
                setPast([]);
                setFuture([]);
                setSelectedId(null);
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
              if (!confirmDiscard()) return;
              const t = emptyTemplate();
              setCurrent(t);
              savedSnapshot.current = "";
              setPast([]);
              setFuture([]);
              setSelectedId(null);
            }}
            className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700"
          >
            New
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              if (confirmDiscard()) onClose();
            }}
            className="rounded-lg px-2 py-1.5 text-ink-500 hover:bg-ink-100"
          >
            <Icon name="x" />
          </button>
        </div>

        {msg && (
          <p
            className={
              "mb-3 rounded-lg px-3 py-2 text-sm " +
              (msg.bad ? "bg-brand-50 text-brand-700" : "bg-emerald-50 text-emerald-800")
            }
          >
            {msg.text}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          {/* ---- Stage ---- */}
          {/* min-w-0 is load-bearing. A grid item defaults to min-width:auto, so
              this column refused to shrink below the stage's width — an 800px
              4 × 2.31 badge made the column 800px wide on a 375px phone, the
              overflow-x-auto inside it never had anything to scroll, and the
              page itself went sideways with the label's left edge off screen
              and unreachable. That was the "cut off on the left" report. */}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                className="ah-input w-auto flex-1 py-1.5 text-sm"
                value={current.name}
                onFocus={pushHistory}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Template name"
              />
              <select
                className="ah-input w-auto py-1.5 text-sm"
                value={current.kind}
                onChange={(e) => {
                  pushHistory();
                  update({ kind: e.target.value as "child" | "guardian" });
                }}
              >
                <option value="child">Child tag</option>
                <option value="guardian">Guardian pickup tag</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={current.is_default}
                  onChange={(e) => {
                    pushHistory();
                    update({ is_default: e.target.checked });
                  }}
                />
                Default
              </label>
            </div>

            {/* Toolbar */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-2 py-1.5">
              <ToolBtn onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">↶</ToolBtn>
              <ToolBtn onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">↷</ToolBtn>
              <Sep />
              <ToolBtn onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} title="Zoom out">−</ToolBtn>
              <span className="w-11 text-center text-xs tabular-nums text-ink-500">{Math.round(zoom * 100)}%</span>
              <ToolBtn onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} title="Zoom in">+</ToolBtn>
              <Sep />
              {/* These were a bare "#" and "⇥" with only a title tooltip, and
                  both defaulted to off — so the grid and the snapping existed
                  but nobody could find them. Spelled out and on by default. */}
              <ToolBtn onClick={() => setShowGrid((g) => !g)} active={showGrid} title="Show the alignment grid">
                Grid
              </ToolBtn>
              <ToolBtn
                onClick={() => updateDesign({ snapToGrid: !current.design.snapToGrid })}
                active={snapOn}
                title="Snap elements to the grid so they line up"
              >
                Snap
              </ToolBtn>
              <select
                className="ah-tight rounded-md border border-ink-200 bg-white px-1.5 py-1 text-xs text-ink-600"
                value={String(gridSize)}
                onChange={(e) => updateDesign({ gridSize: Number(e.target.value) })}
                title="Grid spacing"
                aria-label="Grid spacing"
              >
                <option value="0.01">Fine</option>
                <option value="0.025">Small</option>
                <option value="0.05">Medium</option>
                <option value="0.1">Large</option>
              </select>
              <div className="flex-1" />
              <span className="hidden text-xs text-ink-400 sm:inline">
                Arrows nudge · Del removes · Ctrl+D duplicates
              </span>
            </div>

            {/* `min-w-max justify-center` rather than `mx-auto` on the stage.
                With auto margins, a stage wider than the viewport has its LEFT
                overflow made unreachable — you cannot scroll to it — which is
                what cut off the left edge of the 4 × 2.31 badge. This centres
                only while it fits, and scrolls to both edges when it doesn't. */}
            <div className="overflow-x-auto">
              <div className="flex min-w-max justify-center">
              <div
                ref={stageRef}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
                onClick={(e) => {
                  // Only a real click on the empty label deselects. Not the
                  // click the browser synthesises at the end of a drag, and not
                  // one that bubbled up from an element.
                  if (e.target !== e.currentTarget) return;
                  if (movedDuringDrag.current) {
                    movedDuringDrag.current = false;
                    return;
                  }
                  setSelectedId(null);
                }}
                className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-2 ring-ink-300"
                style={{
                  width: stageW,
                  height: stageH,
                  flex: "0 0 auto",
                  border: current.design.borderWidth
                    ? current.design.borderWidth * pxScale + "px solid " + (current.design.borderColor ?? "#0b0b0c")
                    : undefined,
                  borderRadius: (current.design.borderRadius ?? 0) * pxScale || undefined,
                }}
              >
                {/* The artwork, and ONLY the artwork, wears the print filter.
                    It used to sit on the stage itself, so every editor overlay
                    inherited it — and `contrast(3)` maps a 10%-black gridline
                    (#e6e6e6) straight to white. The grid, the safe-margin guide
                    and every element's dashed outline were all being erased by
                    the black-and-white preview, which is exactly why Grid could
                    read as ON with nothing on screen. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: current.design.background,
                    backgroundImage: current.design.backgroundImage
                      ? `url(${current.design.backgroundImage})`
                      : undefined,
                    // Matches the renderer, which letterboxes by default. The
                    // stage used to force `cover` and quietly disagree with the
                    // print.
                    backgroundSize: current.design.backgroundFit === "cover"
                      ? "cover"
                      : current.design.backgroundFit === "stretch"
                        ? "100% 100%"
                        : "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    filter: current.design.monochrome ? "grayscale(1) contrast(3)" : undefined,
                  }}
                />
                {showGrid && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, rgba(0,0,0,.10) 1px, transparent 1px)," +
                        "linear-gradient(to bottom, rgba(0,0,0,.10) 1px, transparent 1px)",
                      backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                    }}
                  />
                )}
                {!!current.design.safeMarginIn && (
                  <div
                    className="pointer-events-none absolute border border-dashed border-brand-300"
                    style={{
                      left: current.design.safeMarginIn * PX_PER_IN,
                      top: current.design.safeMarginIn * PX_PER_IN,
                      right: current.design.safeMarginIn * PX_PER_IN,
                      bottom: current.design.safeMarginIn * PX_PER_IN,
                    }}
                  />
                )}

                {current.design.elements.map((el) => {
                  const sel = el.id === selectedId;
                  if (el.hidden) return null;
                  const dimmed = !elementVisible(el, SAMPLE, current.kind);
                  const common: React.CSSProperties = {
                    position: "absolute",
                    left: `${el.x * 100}%`,
                    top: `${el.y * 100}%`,
                    width: `${el.w * 100}%`,
                    height: `${el.h * 100}%`,
                    opacity: (el.opacity ?? 1) * (dimmed ? 0.25 : 1),
                    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    outline: sel
                      ? "2px solid #d2303b"
                      : el.locked
                        ? "1px dashed rgba(0,0,0,.35)"
                        : "1px dashed rgba(0,0,0,.15)",
                    cursor: el.locked ? "not-allowed" : "move",
                    touchAction: "none",
                  };
                  return (
                    <div
                      key={el.id}
                      data-el-id={el.id}
                      style={common}
                      onPointerDown={(e) => {
                        // Resolve what was really clicked before starting a
                        // drag: the element whose box caught the pointer may be
                        // a transparent one lying over the thing you meant.
                        const rect = stageRef.current?.getBoundingClientRect();
                        let target = el;
                        if (rect) {
                          const picked = pickAt(
                            (e.clientX - rect.left) / rect.width,
                            (e.clientY - rect.top) / rect.height,
                            selectedId,
                          );
                          if (picked) target = picked;
                        }
                        onPointerDown(e, target, "move");
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = stageRef.current?.getBoundingClientRect();
                        if (!rect) return setSelectedId(el.id);
                        const picked = pickAt(
                          (e.clientX - rect.left) / rect.width,
                          (e.clientY - rect.top) / rect.height,
                          selectedId,
                        );
                        setSelectedId((picked ?? el).id);
                      }}
                    >
                      {el.kind === "text" && (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems:
                              el.valign === "top" ? "flex-start" : el.valign === "bottom" ? "flex-end" : "center",
                            justifyContent:
                              el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
                            textAlign: el.align ?? "left",
                            color: el.color,
                            fontFamily: `"${el.fontFamily}", system-ui, sans-serif`,
                            fontWeight: el.bold ? 700 : 400,
                            fontStyle: el.italic ? "italic" : "normal",
                            fontSize: (el.fontSize ?? 12) * ptScale,
                            lineHeight: el.lineHeight ?? 1.2,
                            letterSpacing: (el.letterSpacing ?? 0) * pxScale,
                            whiteSpace: el.wrap ? "normal" : "nowrap",
                            overflow: "hidden",
                            pointerEvents: "none",
                            filter: artFilter,
                            textTransform: el.uppercase ? "uppercase" : undefined,
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
                            background: el.fill === "transparent" ? "transparent" : el.fill,
                            borderRadius: el.shape === "ellipse" ? "50%" : (el.radius ?? 0) * pxScale,
                            border: el.borderWidth
                              ? `${el.borderWidth * pxScale}px ${el.borderStyle ?? "solid"} ${el.borderColor ?? "#0b0b0c"}`
                              : undefined,
                            pointerEvents: "none",
                            filter: artFilter,
                          }}
                        />
                      )}
                      {el.kind === "image" && el.src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={el.src}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: el.fit === "cover" ? "cover" : el.fit === "stretch" ? "fill" : "contain",
                            pointerEvents: "none",
                            filter: artFilter,
                          }}
                        />
                      )}
                      {(el.kind === "qr" || el.kind === "barcode") && (
                        <div
                          className="flex h-full w-full items-center justify-center border border-dashed border-ink-300 bg-white/70 text-center text-[10px] font-medium text-ink-500"
                          style={{ pointerEvents: "none", filter: artFilter }}
                        >
                          {el.kind === "qr" ? "QR" : "▌▌▍▌"}
                          <span className="ml-1 font-mono">{el.codeValue ?? "{code}"}</span>
                        </div>
                      )}
                      {sel && !el.locked && (
                        // The handle rides the element's bottom-right corner, but
                        // never past the label's edge.
                        //
                        // It used to sit at -bottom-1.5 -right-1.5, i.e. 6px
                        // OUTSIDE the element — so for anything flush with the
                        // label's right or bottom edge the stage's overflow:hidden
                        // cropped it away and that element could not be resized at
                        // all. The stock template's {name} spans to exactly 100%,
                        // which is precisely that case.
                        //
                        // Clamping matters more now that an element may hang off
                        // the edge: without it you could grow something past the
                        // boundary and then never reach the handle to shrink it.
                        <span
                          onPointerDown={(e) => onPointerDown(e, el, "resize")}
                          className="absolute h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-brand-500 shadow"
                          style={{
                            left: `${clamp((Math.min(1, el.x + el.w) - el.x) / (el.w || 1), 0, 1) * 100}%`,
                            top: `${clamp((Math.min(1, el.y + el.h) - el.y) / (el.h || 1), 0, 1) * 100}%`,
                            transform: "translate(-100%, -100%)",
                            touchAction: "none",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
            <p className="mt-1 text-center text-xs text-ink-400">
              {current.width_in}in × {current.height_in}in — the outlined area is the
              label. Anything past its edge is cropped, exactly as it prints.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {churchLogo ? (
                <button
                  onClick={addLogo}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={churchLogo} alt="" className="h-4 w-4 object-contain" />
                  + Church logo
                </button>
              ) : (
                <label
                  className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
                  title="Upload it once — after that it's one tap on any template"
                >
                  + Set church logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 400_000) {
                        setMsg({
                          text: `That image is ${(f.size / 1024).toFixed(0)}KB. Please use one under 400KB.`,
                          bad: true,
                        });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => saveAsChurchLogo(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              )}
              <AddBtn onClick={() => addEl("text")}>+ Text</AddBtn>
              <AddBtn onClick={() => addEl("rect")}>+ Box</AddBtn>
              <AddBtn onClick={() => addEl("line")}>+ Line</AddBtn>
              <AddBtn onClick={() => addEl("qr")}>+ QR code</AddBtn>
              <AddBtn onClick={() => addEl("barcode")}>+ Barcode</AddBtn>
              <AddBtn onClick={() => setArtOpen((o) => !o)}>+ Clip art</AddBtn>
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

            {artOpen && (
              <div className="mt-3 rounded-xl border border-ink-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {CLIPART_CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setArtCat(c.key)}
                      className={
                        "rounded-full px-3 py-1 text-sm transition " +
                        (artCat === c.key
                          ? "bg-accent text-onaccent"
                          : "bg-ink-100 text-ink-600 hover:bg-ink-200")
                      }
                    >
                      {c.label}
                    </button>
                  ))}
                  <span className="flex-1" />
                  <label className="flex items-center gap-1.5 text-xs text-ink-500">
                    Colour
                    <input
                      type="color"
                      value={artColor}
                      onChange={(e) => setArtColor(e.target.value)}
                      className="h-7 w-10 rounded border border-ink-200"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                  {CLIPART.filter((a) => a.category === artCat).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => addArt(a)}
                      title={a.label}
                      className="flex aspect-square items-center justify-center rounded-lg border border-ink-100 bg-ink-50 p-1.5 transition hover:border-brand-300 hover:bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={clipArtDataUrl(a, artColor)} alt={a.label} className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  Click art to drop it on the label, then drag to position and resize.
                </p>
              </div>
            )}

            <div className="mt-3">
              <p className="mb-1 text-xs text-ink-500">
                Merge fields — click one to add it to the selected text box, or to drop a new one onto the label:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_FIELDS.map((f) => (
                  <button
                    key={f.token}
                    title={f.label}
                    /* Not disabled. These were greyed out unless a text box was
                       already selected, which is exactly why they could only
                       ever merge and never add: insertMergeField creates a box
                       when there is nothing to append to, and a disabled button
                       meant that path could never run. */
                    onClick={() => insertMergeField(f.token)}
                    className="rounded-md bg-ink-100 px-2 py-1 font-mono text-xs text-ink-600 transition hover:bg-ink-200"
                  >
                    {f.token}
                  </button>
                ))}
              </div>
            </div>

            {preview && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Print preview (actual output at {PRINT_DPI}dpi)
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Label preview"
                  className="rounded border border-ink-200"
                  style={{ width: stageW, maxWidth: "100%" }}
                />
              </div>
            )}
          </div>

          {/* ---- Inspector ---- */}
          <aside className="space-y-4">
            <Panel title="Layers">
              {current.design.elements.length === 0 && (
                <p className="text-sm text-ink-400">Nothing on the label yet.</p>
              )}
              {/* Topmost first — that's the order people expect to read a stack in. */}
              <ul className="space-y-1">
                {[...current.design.elements].reverse().map((el) => (
                  <li
                    key={el.id}
                    className={
                      "flex items-center gap-1 rounded-md px-1.5 py-1 text-sm " +
                      (el.id === selectedId ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-50")
                    }
                  >
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedId(el.id)}>
                      {el.name || defaultLayerName(el)}
                    </button>
                    <IconBtn
                      title={el.hidden ? "Show" : "Hide"}
                      onClick={() => {
                        pushHistory();
                        updateEl(el.id, { hidden: !el.hidden });
                      }}
                    >
                      {el.hidden ? "◌" : "◉"}
                    </IconBtn>
                    <IconBtn
                      title={el.locked ? "Unlock" : "Lock"}
                      onClick={() => {
                        pushHistory();
                        updateEl(el.id, { locked: !el.locked });
                      }}
                    >
                      {el.locked ? "🔒" : "🔓"}
                    </IconBtn>
                    <IconBtn title="Bring forward" onClick={() => reorder(el.id, "up")}>▲</IconBtn>
                    <IconBtn title="Send backward" onClick={() => reorder(el.id, "down")}>▼</IconBtn>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Label">
              <Row label="Label size (DYMO stock)">
                <select
                  className="ah-input py-1 text-sm"
                  // Keyed by preset id: several rolls share dimensions, so a
                  // width×height value could never round-trip to the right one.
                  value={
                    LABEL_PRESETS.find((l) => l.w === current.width_in && l.h === current.height_in)?.id ?? ""
                  }
                  onChange={(e) => {
                    const preset = LABEL_PRESETS.find((l) => l.id === e.target.value);
                    if (preset) {
                      pushHistory();
                      update({ width_in: preset.w, height_in: preset.h });
                    }
                  }}
                >
                  <option value="">Custom…</option>
                  {LABEL_PRESETS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.w}in × {l.h}in{l.note ? " (" + l.note + ")" : ""}
                    </option>
                  ))}
                </select>
              </Row>
              <div className="grid grid-cols-2 gap-2">
                <Row label="Width (in)">
                  <input type="number" step="0.125" className="ah-input py-1 text-sm" value={current.width_in}
                    onFocus={pushHistory}
                    onChange={(e) => update({ width_in: Number(e.target.value) || 3.5 })} />
                </Row>
                <Row label="Height (in)">
                  <input type="number" step="0.125" className="ah-input py-1 text-sm" value={current.height_in}
                    onFocus={pushHistory}
                    onChange={(e) => update({ height_in: Number(e.target.value) || 1.125 })} />
                </Row>
              </div>
              <Row label="Background">
                <input type="color" className="h-8 w-full rounded border border-ink-200" value={current.design.background}
                  onChange={(e) => updateDesign({ background: e.target.value })} />
              </Row>
              <Row label={"Label border (" + (current.design.borderWidth ?? 0) + "px)"}>
                <input type="range" min={0} max={12} value={current.design.borderWidth ?? 0} className="w-full"
                  onPointerDown={pushHistory}
                  onChange={(e) => updateDesign({ borderWidth: Number(e.target.value) })} />
              </Row>
              {(current.design.borderWidth ?? 0) > 0 && (
                <>
                  <Row label="Border colour">
                    <input type="color" className="h-8 w-full rounded border border-ink-200"
                      value={current.design.borderColor ?? "#0b0b0c"}
                      onChange={(e) => updateDesign({ borderColor: e.target.value })} />
                  </Row>
                  <Row label={"Border radius (" + (current.design.borderRadius ?? 0) + ")"}>
                    <input type="range" min={0} max={40} value={current.design.borderRadius ?? 0} className="w-full"
                      onPointerDown={pushHistory}
                      onChange={(e) => updateDesign({ borderRadius: Number(e.target.value) })} />
                  </Row>
                </>
              )}
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={!!current.design.monochrome}
                  onChange={(e) => {
                    pushHistory();
                    updateDesign({ monochrome: e.target.checked });
                  }} />
                Black &amp; white (matches thermal printing)
              </label>
              {current.design.monochrome && (
                <Row label={`Threshold (${current.design.monochromeThreshold ?? 160})`}>
                  <input type="range" min={60} max={240} value={current.design.monochromeThreshold ?? 160} className="w-full"
                    onPointerDown={pushHistory}
                    onChange={(e) => updateDesign({ monochromeThreshold: Number(e.target.value) })} />
                </Row>
              )}
              <Row label={`Safe margin (${(current.design.safeMarginIn ?? 0).toFixed(3)}in)`}>
                <input type="range" min={0} max={0.25} step={0.015625} value={current.design.safeMarginIn ?? 0} className="w-full"
                  onPointerDown={pushHistory}
                  onChange={(e) => updateDesign({ safeMarginIn: Number(e.target.value) })} />
              </Row>
              <label className="mt-1 block cursor-pointer rounded-lg bg-ink-100 px-3 py-1.5 text-center text-sm font-medium text-ink-700">
                Background image
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "background")} />
              </label>
              {current.design.backgroundImage && (
                <>
                  <Row label="Background fit">
                    <select className="ah-input py-1 text-sm" value={current.design.backgroundFit ?? "contain"}
                      onChange={(e) => {
                        pushHistory();
                        updateDesign({ backgroundFit: e.target.value as TagDesign["backgroundFit"] });
                      }}>
                      <option value="contain">Fit inside</option>
                      <option value="cover">Fill and crop</option>
                      <option value="stretch">Stretch</option>
                    </select>
                  </Row>
                  <button onClick={() => { pushHistory(); updateDesign({ backgroundImage: undefined }); }}
                    className="mt-1 w-full text-xs text-brand-600 underline">
                    Remove background image
                  </button>
                </>
              )}
            </Panel>

            {selected ? (
              <Panel title={`Selected: ${selected.kind}`}>
                <Row label="Layer name">
                  <input className="ah-input py-1 text-sm" value={selected.name ?? ""}
                    placeholder={defaultLayerName(selected)}
                    onFocus={pushHistory}
                    onChange={(e) => updateEl(selected.id, { name: e.target.value })} />
                </Row>

                {selected.kind === "text" && (
                  <>
                    <Row label="Text">
                      <textarea className="ah-input py-1 text-sm" rows={2} value={selected.text ?? ""}
                        onFocus={pushHistory}
                        onChange={(e) => updateEl(selected.id, { text: e.target.value })} />
                    </Row>
                    <Row label="Font">
                      <select
                        className="ah-input py-1 text-sm"
                        value={selected.fontFamily}
                        onChange={(e) => {
                          pushHistory();
                          const family = e.target.value;
                          // Fetch it now, so the stage and the 300dpi preview
                          // both render in the real face instead of falling
                          // back for the first second.
                          void loadFont(family);
                          updateEl(selected.id, { fontFamily: family });
                        }}
                      >
                        {(["Sans", "Serif", "Display", "Handwriting", "Mono"] as const).map((group) => (
                          <optgroup key={group} label={group}>
                            {GOOGLE_FONTS.filter((f) => f.group === group).map((f) => (
                              <option key={f.name} value={f.name}>{f.name}</option>
                            ))}
                          </optgroup>
                        ))}
                        <optgroup label="On this device">
                          {SYSTEM_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </optgroup>
                      </select>
                    </Row>
                    <Row label={`Size (${selected.fontSize}pt)`}>
                      <input type="range" min={5} max={60} value={selected.fontSize ?? 12} className="w-full"
                        onPointerDown={pushHistory}
                        onChange={(e) => updateEl(selected.id, { fontSize: Number(e.target.value) })} />
                    </Row>
                    <Row label="Colour">
                      <input type="color" className="h-8 w-full rounded border border-ink-200" value={selected.color ?? "#000000"}
                        onChange={(e) => updateEl(selected.id, { color: e.target.value })} />
                    </Row>
                    <div className="grid grid-cols-2 gap-2">
                      <Row label="Align">
                        <select className="ah-input py-1 text-sm" value={selected.align ?? "left"}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { align: e.target.value as TagElement["align"] }); }}>
                          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                        </select>
                      </Row>
                      <Row label="Vertical">
                        <select className="ah-input py-1 text-sm" value={selected.valign ?? "middle"}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { valign: e.target.value as TagElement["valign"] }); }}>
                          <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
                        </select>
                      </Row>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-ink-700">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!selected.bold}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { bold: e.target.checked }); }} /> Bold
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!selected.italic}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { italic: e.target.checked }); }} /> Italic
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!selected.uppercase}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { uppercase: e.target.checked }); }} /> UPPERCASE
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!selected.wrap}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { wrap: e.target.checked }); }} /> Wrap lines
                      </label>
                    </div>
                    {selected.wrap && (
                      <Row label={`Line height (${(selected.lineHeight ?? 1.2).toFixed(2)})`}>
                        <input type="range" min={0.8} max={2} step={0.05} value={selected.lineHeight ?? 1.2} className="w-full"
                          onPointerDown={pushHistory}
                          onChange={(e) => updateEl(selected.id, { lineHeight: Number(e.target.value) })} />
                      </Row>
                    )}
                    <Row label={`Letter spacing (${selected.letterSpacing ?? 0})`}>
                      <input type="range" min={0} max={12} value={selected.letterSpacing ?? 0} className="w-full"
                        onPointerDown={pushHistory}
                        onChange={(e) => updateEl(selected.id, { letterSpacing: Number(e.target.value) })} />
                    </Row>
                    <Row label={`Never shrink below (${selected.minFontSize ?? 6}pt)`}>
                      <input type="range" min={4} max={20} value={selected.minFontSize ?? 6} className="w-full"
                        onPointerDown={pushHistory}
                        onChange={(e) => updateEl(selected.id, { minFontSize: Number(e.target.value) })} />
                    </Row>
                  </>
                )}

                {(selected.kind === "qr" || selected.kind === "barcode") && (
                  <>
                    <Row label="Encodes">
                      <input className="ah-input py-1 font-mono text-sm" value={selected.codeValue ?? "{code}"}
                        onFocus={pushHistory}
                        onChange={(e) => updateEl(selected.id, { codeValue: e.target.value })} />
                    </Row>
                    <p className="text-xs text-ink-400">
                      Merge fields work here too — <code>{"{code}"}</code> is the pickup code a
                      volunteer scans to find the right child.
                    </p>
                    <Row label="Colour">
                      <input type="color" className="h-8 w-full rounded border border-ink-200" value={selected.color ?? "#0b0b0c"}
                        onChange={(e) => updateEl(selected.id, { color: e.target.value })} />
                    </Row>
                    {selected.kind === "qr" ? (
                      <Row label="Error correction">
                        <select className="ah-input py-1 text-sm" value={selected.qrEcc ?? "M"}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { qrEcc: e.target.value as TagElement["qrEcc"] }); }}>
                          <option value="L">L — smallest</option>
                          <option value="M">M — recommended</option>
                          <option value="Q">Q — tolerant</option>
                          <option value="H">H — most tolerant</option>
                        </select>
                      </Row>
                    ) : (
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input type="checkbox" checked={!!selected.showCodeText}
                          onChange={(e) => { pushHistory(); updateEl(selected.id, { showCodeText: e.target.checked }); }} />
                        Print the code as text underneath
                      </label>
                    )}
                  </>
                )}

                {selected.kind === "image" && (
                  <Row label="Image fit">
                    <select className="ah-input py-1 text-sm" value={selected.fit ?? "contain"}
                      onChange={(e) => { pushHistory(); updateEl(selected.id, { fit: e.target.value as TagElement["fit"] }); }}>
                      <option value="contain">Fit inside</option>
                      <option value="cover">Fill and crop</option>
                      <option value="stretch">Stretch</option>
                    </select>
                  </Row>
                )}
                {selected.kind === "image" && selected.src && selected.src !== churchLogo && (
                  // Promote whatever is selected to THE church logo, so it is
                  // one tap on every future template rather than a file hunt.
                  <button
                    onClick={() => saveAsChurchLogo(selected.src!)}
                    className="ah-tight w-full rounded-lg bg-ink-100 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200"
                  >
                    Use this as the church logo
                  </button>
                )}

                {selected.kind === "rect" && (
                  <Row label="Shape">
                    <select className="ah-input py-1 text-sm" value={selected.shape ?? "rect"}
                      onChange={(e) => { pushHistory(); updateEl(selected.id, { shape: e.target.value as "rect" | "ellipse" }); }}>
                      <option value="rect">Rectangle</option>
                      <option value="ellipse">Ellipse / circle</option>
                    </select>
                  </Row>
                )}
                {(selected.kind === "rect" || selected.kind === "line") && (
                  <>
                    <Row label="Fill">
                      <div className="flex items-center gap-2">
                        <input type="color" className="h-8 flex-1 rounded border border-ink-200"
                          value={selected.fill && selected.fill !== "transparent" ? selected.fill : "#d2303b"}
                          onChange={(e) => updateEl(selected.id, { fill: e.target.value })} />
                        <label className="flex items-center gap-1 text-xs text-ink-600">
                          <input type="checkbox" checked={selected.fill === "transparent"}
                            onChange={(e) => {
                              pushHistory();
                              updateEl(selected.id, { fill: e.target.checked ? "transparent" : "#d2303b" });
                            }} />
                          None
                        </label>
                      </div>
                    </Row>
                    <Row label={`Corner radius (${selected.radius ?? 0})`}>
                      <input type="range" min={0} max={24} value={selected.radius ?? 0} className="w-full"
                        onPointerDown={pushHistory}
                        onChange={(e) => updateEl(selected.id, { radius: Number(e.target.value) })} />
                    </Row>
                  </>
                )}
                {selected.kind !== "line" && (
                  <>
                    <Row label={"Border (" + (selected.borderWidth ?? 0) + "px)"}>
                      <input type="range" min={0} max={12} value={selected.borderWidth ?? 0} className="w-full"
                        onPointerDown={pushHistory}
                        onChange={(e) => updateEl(selected.id, { borderWidth: Number(e.target.value) })} />
                    </Row>
                    {(selected.borderWidth ?? 0) > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <Row label="Border colour">
                          <input type="color" className="h-8 w-full rounded border border-ink-200"
                            value={selected.borderColor ?? "#0b0b0c"}
                            onChange={(e) => updateEl(selected.id, { borderColor: e.target.value })} />
                        </Row>
                        <Row label="Style">
                          <select className="ah-input py-1 text-sm" value={selected.borderStyle ?? "solid"}
                            onChange={(e) => { pushHistory(); updateEl(selected.id, { borderStyle: e.target.value as TagElement["borderStyle"] }); }}>
                            <option value="solid">Solid</option>
                            <option value="dashed">Dashed</option>
                            <option value="dotted">Dotted</option>
                          </select>
                        </Row>
                      </div>
                    )}
                  </>
                )}

                {/* Same containment as dragging and as the arrow keys. Three
                    places used to compute this independently. */}
                <div className="grid grid-cols-4 gap-1.5">
                  <NumBox label="X %" value={selected.x} onFocus={pushHistory}
                    onChange={(v) => updateEl(selected.id, { x: clampX(v, selected.w) })} />
                  <NumBox label="Y %" value={selected.y} onFocus={pushHistory}
                    onChange={(v) => updateEl(selected.id, { y: clampY(v, selected.h) })} />
                  <NumBox label="W %" value={selected.w} onFocus={pushHistory}
                    onChange={(v) => updateEl(selected.id, { w: Math.max(MIN_SIZE, v) })} />
                  <NumBox label="H %" value={selected.h} onFocus={pushHistory}
                    onChange={(v) => updateEl(selected.id, { h: Math.max(MIN_SIZE, v) })} />
                </div>
                {/* Rotation. TagElement.rotation and renderTagToPng have
                    supported this all along — there was simply no way to set
                    it, which is why the only rotated things on a label were
                    ones that arrived with a template. */}
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs font-medium text-ink-500">
                    <span>Rotation</span>
                    <span className="tabular-nums text-ink-400">{selected.rotation ?? 0}°</span>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={selected.rotation ?? 0}
                    onFocus={pushHistory}
                    onChange={(e) => updateEl(selected.id, { rotation: Number(e.target.value) })}
                    className="w-full"
                  />
                  <span className="mt-1 flex flex-wrap gap-1">
                    {[0, 90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => {
                          pushHistory();
                          updateEl(selected.id, { rotation: deg === 0 ? 0 : deg > 180 ? deg - 360 : deg });
                        }}
                        className="ah-tight rounded-md bg-ink-100 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-200"
                      >
                        {deg}°
                      </button>
                    ))}
                  </span>
                </label>

                <button
                  onClick={() => {
                    pushHistory();
                    fitToContent(selected);
                  }}
                  className="ah-tight w-full rounded-lg bg-ink-100 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200"
                >
                  Shrink box to fit its content
                </button>

                <Row label="Align on label">
                  <div className="flex flex-wrap gap-1">
                    <IconBtn title="Align left" onClick={() => alignEl(selected.id, "left")}>⇤</IconBtn>
                    <IconBtn title="Centre horizontally" onClick={() => alignEl(selected.id, "hcenter")}>↔</IconBtn>
                    <IconBtn title="Align right" onClick={() => alignEl(selected.id, "right")}>⇥</IconBtn>
                    <IconBtn title="Align top" onClick={() => alignEl(selected.id, "top")}>⤒</IconBtn>
                    <IconBtn title="Centre vertically" onClick={() => alignEl(selected.id, "vcenter")}>↕</IconBtn>
                    <IconBtn title="Align bottom" onClick={() => alignEl(selected.id, "bottom")}>⤓</IconBtn>
                  </div>
                </Row>

                <Row label={`Rotation (${selected.rotation ?? 0}°)`}>
                  <input type="range" min={-180} max={180} value={selected.rotation ?? 0} className="w-full"
                    onPointerDown={pushHistory}
                    onChange={(e) => updateEl(selected.id, { rotation: Number(e.target.value) })} />
                </Row>
                <Row label={`Opacity (${((selected.opacity ?? 1) * 100).toFixed(0)}%)`}>
                  <input type="range" min={0.1} max={1} step={0.05} value={selected.opacity ?? 1} className="w-full"
                    onPointerDown={pushHistory}
                    onChange={(e) => updateEl(selected.id, { opacity: Number(e.target.value) })} />
                </Row>
                <Row label="Show this element">
                  <select className="ah-input py-1 text-sm"
                    value={selected.showIf ?? (selected.onlyIfAllergy ? "allergy" : "always")}
                    onChange={(e) => {
                      pushHistory();
                      // Writing showIf retires the legacy flag so the two can't disagree.
                      updateEl(selected.id, {
                        showIf: e.target.value as TagElement["showIf"],
                        onlyIfAllergy: undefined,
                      });
                    }}>
                    <option value="always">Always</option>
                    <option value="allergy">Only if child has an allergy</option>
                    <option value="noAllergy">Only if NO allergy</option>
                    <option value="hasRoom">Only if a room is assigned</option>
                    <option value="hasCode">Only if there is a code</option>
                    <option value="childOnly">Child tags only</option>
                    <option value="guardianOnly">Guardian tags only</option>
                  </select>
                </Row>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => duplicateEl(selected.id)}
                    className="flex-1 rounded-lg bg-ink-100 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
                    Duplicate
                  </button>
                  <button onClick={() => removeEl(selected.id)} disabled={selected.locked}
                    className="flex-1 rounded-lg bg-brand-50 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-40">
                    Delete
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reorder(selected.id, "front")}
                    className="flex-1 rounded-lg bg-ink-100 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200">
                    Bring to front
                  </button>
                  <button onClick={() => reorder(selected.id, "back")}
                    className="flex-1 rounded-lg bg-ink-100 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200">
                    Send to back
                  </button>
                </div>
              </Panel>
            ) : (
              <Panel title="Selected">
                <p className="text-sm text-ink-400">Click an element on the label to edit it.</p>
              </Panel>
            )}

            <Panel title="Template">
              <button onClick={duplicateTemplate}
                className="w-full rounded-lg bg-ink-100 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
                Duplicate this template
              </button>
              {current.id && (
                <button onClick={deleteTemplate}
                  className="w-full rounded-lg bg-brand-50 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
                  Delete this template
                </button>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Smallest an element may be resized to, as a fraction of the label. */
const MIN_SIZE = 0.03;

/**
 * How much of an element must stay on the label. Not 100%.
 *
 * Containment used to be `clamp(x, 0, 1 - w)` — the WHOLE box inside. That
 * reads as safe and is actually a wall: a text box 92% wide (which the stock
 * template's {church} and {name} both are, because a text box is sized to its
 * slot rather than its glyphs) has 8% of the label to move in. With snapping on
 * at 5% that is two reachable positions. {name} sat pinned at exactly its own
 * maximum and could not go right at all.
 *
 * The no-overflow guarantee never needed that wall. renderTagToPng draws into a
 * canvas that IS the label, so anything past the edge is simply not in the
 * output, and the stage has overflow:hidden so the screen crops identically.
 * All the clamp has to do is stop you losing an element off the edge entirely.
 */
const MIN_ON_LABEL = 0.08;

/** Keep at least MIN_ON_LABEL of the element on the label, either edge. */
function containAxis(v: number, size: number) {
  const keep = Math.min(size, MIN_ON_LABEL);
  return clamp(v, -(size - keep), 1 - keep);
}
const clampX = containAxis;
const clampY = containAxis;
function defaultLayerName(el: TagElement) {
  if (el.kind === "text") return (el.text ?? "Text").slice(0, 24) || "Text";
  if (el.kind === "qr") return "QR code";
  if (el.kind === "barcode") return "Barcode";
  if (el.kind === "image") return "Image";
  if (el.kind === "line") return "Line";
  return "Box";
}
function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
      {children}
    </button>
  );
}
function ToolBtn({
  onClick, children, title, disabled, active,
}: {
  onClick: () => void; children: React.ReactNode; title: string; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={
        "h-8 w-8 rounded-md text-sm transition disabled:opacity-30 " +
        (active ? "bg-accent text-onaccent" : "bg-ink-100 text-ink-700 hover:bg-ink-200")
      }
    >
      {children}
    </button>
  );
}
function IconBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="h-7 w-7 shrink-0 rounded-md bg-ink-100 text-xs text-ink-600 transition hover:bg-ink-200"
    >
      {children}
    </button>
  );
}
function NumBox({
  label, value, onChange, onFocus,
}: {
  label: string; value: number; onChange: (v: number) => void; onFocus: () => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-ink-500">{label}</span>
      <input
        type="number"
        step={0.5}
        className="ah-input py-1 text-xs"
        value={Number((value * 100).toFixed(1))}
        onFocus={onFocus}
        onChange={(e) => onChange(clamp(Number(e.target.value) / 100, -0.1, 1.2))}
      />
    </label>
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
function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-ink-200" />;
}
