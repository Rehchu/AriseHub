"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface SlideFile {
  id: string;
  kind: string;
  storage_key: string;
  filename: string | null;
  page_number: number | null;
  page_from: number | null;
  page_to: number | null;
  visibility: string;
}

interface Thumb {
  page: number; // absolute page in the source PDF
  dataUrl: string;
}

const SLIDE_W = 13.333; // 16:9 inches, matching the deck generator
const SLIDE_H = 7.5;

/**
 * Turn a Proclaim export into a published slide deck.
 *
 * Everything heavy happens in the browser: the PDF is rendered with pdf.js and
 * the PowerPoint assembled with pptxgenjs, so the Worker only ever handles
 * finished bytes. A printed PDF has no recoverable text boxes, so one full-bleed
 * image per slide IS the faithful conversion — there is no "editable" version to
 * recover.
 *
 * The export covers the whole morning (pre-service loop, countdown,
 * announcements, message, post-service), which is why the range picker exists:
 * only the pages someone chooses become the published deck.
 */
export function SlidesPanel({
  sermonId,
  files,
  canManage,
}: {
  sermonId: string;
  files: SlideFile[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(0);

  const slides = files
    .filter((f) => f.kind === "slide_image")
    .sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0));
  const deck = files.find((f) => f.kind === "slides_pptx");

  /** Render every page to a thumbnail so the range can be chosen by eye. */
  async function loadPdf(file: File) {
    setBusy(true);
    setStatus("Reading the PDF…");
    setThumbs([]);
    try {
      // Dynamic import: pdf.js is large and only this panel needs it.
      const pdfjs = await import("pdfjs-dist");
      // The worker is resolved as a bundled asset via import.meta.url, which is
      // what Turbopack understands — a "?url" suffix is a Vite idiom and would
      // not resolve here.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const out: Thumb[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        setStatus(`Rendering page ${n} of ${doc.numPages}…`);
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        out.push({ page: n, dataUrl: canvas.toDataURL("image/jpeg", 0.7) });
      }
      setThumbs(out);
      setPdfFile(file);
      setFrom(1);
      setTo(out.length);
      setStatus(`${out.length} pages — now choose the range that is the message.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't read that PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(blob: Blob, filename: string, type: string): Promise<string | null> {
    const form = new FormData();
    form.append("file", new File([blob], filename, { type }));
    form.append("folder", `sermon-slides/${sermonId}`);
    const res = await fetch("/api/files/upload", { method: "POST", body: form });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Upload failed (${res.status})`);
    }
    return ((await res.json()) as { key?: string }).key ?? null;
  }

  /** Render the chosen pages at full size, build the .pptx, store everything. */
  async function publishRange() {
    if (!pdfFile) return;
    setBusy(true);
    setStatus("Rendering the selected pages…");
    try {
      const pdfjs = await import("pdfjs-dist");
      const doc = await pdfjs.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: "W", width: SLIDE_W, height: SLIDE_H });
      pptx.layout = "W";

      // Replace any previous publish for this sermon, so re-running the picker
      // corrects a bad range instead of stacking a second deck on top.
      const { data: old } = await supabase
        .from("sermon_files")
        .select("id")
        .eq("sermon_id", sermonId)
        .in("kind", ["slide_image", "slides_pptx"]);
      if (old && old.length) {
        await supabase
          .from("sermon_files")
          .delete()
          .in("id", (old as { id: string }[]).map((o) => o.id));
      }

      const rows: Record<string, unknown>[] = [];
      for (let n = from; n <= to; n++) {
        setStatus(`Building slide ${n - from + 1} of ${to - from + 1}…`);
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

        // Full-bleed image per slide.
        const slide = pptx.addSlide();
        slide.addImage({ data: dataUrl, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H });

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.85),
        );
        if (!blob) continue;
        const key = await upload(blob, `page-${n}.jpg`, "image/jpeg");
        if (key) {
          rows.push({
            sermon_id: sermonId,
            kind: "slide_image",
            storage_key: key,
            filename: `page-${n}.jpg`,
            content_type: "image/jpeg",
            size_bytes: blob.size,
            page_number: n, // absolute, so re-trimming never orphans a slide
            visibility: "members",
          });
        }
      }

      setStatus("Building the PowerPoint…");
      const pptxBlob = (await pptx.write({ outputType: "blob" })) as Blob;
      const pptxKey = await upload(
        pptxBlob,
        "slides.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
      if (pptxKey) {
        rows.push({
          sermon_id: sermonId,
          kind: "slides_pptx",
          storage_key: pptxKey,
          filename: "slides.pptx",
          content_type:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          size_bytes: pptxBlob.size,
          page_from: from,
          page_to: to,
          visibility: "members",
        });
      }

      // The original export is kept as the source of truth, but at staff
      // visibility: it still contains the announcements and everything else that
      // was on screen that morning.
      if (pdfFile.size <= 40 * 1024 * 1024) {
        setStatus("Archiving the original PDF…");
        const pdfKey = await upload(pdfFile, pdfFile.name, "application/pdf");
        if (pdfKey) {
          rows.push({
            sermon_id: sermonId,
            kind: "slides_pdf",
            storage_key: pdfKey,
            filename: pdfFile.name,
            content_type: "application/pdf",
            size_bytes: pdfFile.size,
            page_count: doc.numPages,
            page_from: from,
            page_to: to,
            visibility: "staff",
          });
        }
      }

      const { error } = await supabase.from("sermon_files").insert(rows);
      if (error) throw new Error(error.message);

      setStatus(`Published ${to - from + 1} slides.`);
      setThumbs([]);
      setPdfFile(null);
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Publishing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Slides</h2>

      {slides.length > 0 && (
        <div className="mt-2 rounded-xl border border-ink-100 bg-white p-3">
          <div className="overflow-hidden rounded-lg bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${slides[Math.min(viewing, slides.length - 1)].storage_key}`}
              alt={`Slide ${viewing + 1} of ${slides.length}`}
              className="mx-auto max-h-[60vh] w-full object-contain"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setViewing((v) => Math.max(0, v - 1))}
              disabled={viewing === 0}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setViewing((v) => Math.min(slides.length - 1, v + 1))}
              disabled={viewing >= slides.length - 1}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next ›
            </button>
            <span className="text-sm text-ink-500">
              {Math.min(viewing + 1, slides.length)} / {slides.length}
            </span>
            {deck && (
              <a
                href={`/api/files/${deck.storage_key}`}
                download="slides.pptx"
                className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-onaccent hover:bg-accent-strong"
              >
                Download PowerPoint
              </a>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <div className="mt-3 rounded-xl border border-ink-100 bg-white p-4">
          <h3 className="text-sm font-semibold text-ink-900">
            {slides.length > 0 ? "Replace the slides" : "Publish the slides"}
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            In Proclaim: <strong>File → Print Presentation</strong>, then choose{" "}
            <strong>Save as PDF</strong> in the browser&apos;s print dialog. Upload that here and
            pick the pages that are the message — the rest of the morning stays out of the
            published deck.
          </p>
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadPdf(f);
              e.target.value = "";
            }}
            className="mt-2 block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-onaccent"
          />
          {status && <p className="mt-2 text-xs text-ink-600">{status}</p>}

          {thumbs.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm text-ink-700">
                  First page
                  <input
                    type="number"
                    min={1}
                    max={thumbs.length}
                    value={from}
                    onChange={(e) => setFrom(Math.max(1, Math.min(thumbs.length, +e.target.value)))}
                    className="mt-1 w-24 rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm text-ink-700">
                  Last page
                  <input
                    type="number"
                    min={from}
                    max={thumbs.length}
                    value={to}
                    onChange={(e) => setTo(Math.max(from, Math.min(thumbs.length, +e.target.value)))}
                    className="mt-1 w-24 rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={publishRange}
                  disabled={busy}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent disabled:opacity-50"
                >
                  {busy ? "Working…" : `Publish pages ${from}–${to}`}
                </button>
              </div>

              <div className="mt-3 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                {thumbs.map((t) => {
                  const inRange = t.page >= from && t.page <= to;
                  return (
                    <button
                      key={t.page}
                      onClick={() => (t.page < from ? setFrom(t.page) : setTo(t.page))}
                      title={
                        t.page < from ? `Start at page ${t.page}` : `End at page ${t.page}`
                      }
                      className={`overflow-hidden rounded border-2 transition ${
                        inRange ? "border-accent" : "border-transparent opacity-40"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.dataUrl} alt={`Page ${t.page}`} className="w-full" />
                      <span className="block bg-ink-50 py-0.5 text-center text-[10px] text-ink-500">
                        {t.page}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
