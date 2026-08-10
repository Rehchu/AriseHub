"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The one overlay every dialog in the app sits in.
 *
 * Before this each modal hand-rolled its outer div, and most of them only
 * closed via their own little × — no Escape, no backdrop click, no scroll lock,
 * nothing for a screen reader to announce. Eight dialogs, eight behaviours.
 *
 * Call sites keep their own panel markup; this replaces only the wrapper:
 *
 *   <Modal onClose={onClose} align="start" className="p-4 pt-16" label="New task">
 *     <form className="w-full max-w-md …">…</form>
 *   </Modal>
 *
 * What it guarantees:
 *  - Escape closes, and only the topmost dialog reacts.
 *  - Clicking the backdrop closes. Press and release must BOTH land on the
 *    backdrop, so selecting text inside the panel and releasing outside it
 *    doesn't throw the dialog away mid-sentence.
 *  - The page behind stops scrolling.
 *  - Focus moves in on open and returns to whatever opened it on close.
 *  - Tab stays inside.
 *  - role="dialog" + aria-modal + a label.
 */
export function Modal({
  onClose,
  children,
  /** Vertical placement. Bottom sheets on phones want "end". */
  align = "center",
  /** Horizontal placement. Side panels want "end". */
  justify = "center",
  /** How dark the backdrop is. */
  dim = "bg-black/50",
  /** Layout classes for the backdrop — padding, breakpoint alignment overrides. */
  className = "",
  labelledBy,
  label,
}: {
  onClose: () => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  justify?: "center" | "end";
  dim?: string;
  className?: string;
  labelledBy?: string;
  label?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  const focusables = useCallback(() => {
    const root = rootRef.current;
    if (!root) return [] as HTMLElement[];
    return [
      ...root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
  }, []);

  // Escape. Capture phase on the document so it fires wherever focus sits, and
  // stopPropagation so a dialog opened over another doesn't dismiss both.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [close]);

  // Scroll lock. Counted, because the inner of two stacked dialogs unmounting
  // must not hand scrolling back while the outer is still up.
  useEffect(() => {
    const body = document.body;
    const depth = Number(body.dataset.modalDepth ?? "0") + 1;
    body.dataset.modalDepth = String(depth);
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      const left = Number(body.dataset.modalDepth ?? "1") - 1;
      if (left <= 0) {
        delete body.dataset.modalDepth;
        body.style.overflow = prev;
      } else {
        body.dataset.modalDepth = String(left);
      }
    };
  }, []);

  // Focus in, then back out to the trigger.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const root = rootRef.current;
    // An explicit autoFocus inside the panel wins; otherwise take the wrapper
    // so the next Tab lands on the first control rather than the page behind.
    if (root && !root.querySelector("[autofocus]")) root.focus({ preventScroll: true });
    const back = restoreTo.current;
    return () => back?.focus?.({ preventScroll: true });
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === rootRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Spelled out rather than interpolated: Tailwind scans source text for whole
  // class names, and a `items-${align}` template produces none of them.
  const alignment =
    align === "start" ? "items-start" : align === "end" ? "items-end" : "items-center";
  const justification = justify === "end" ? "justify-end" : "justify-center";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) close();
        downOnBackdrop.current = false;
      }}
      // overflow-y-auto on the backdrop, not just the page: the panel is a flex
      // child, and a form taller than the viewport (Request event, Get IT Help,
      // New task — worst with the on-screen keyboard up) otherwise overflows off
      // the top or bottom edge while the body behind is scroll-locked, so Submit
      // is simply unreachable. With the backdrop scrollable the whole panel
      // scrolls as a unit and every field is reachable at any height. py-4 keeps
      // a scrolled panel off the very edge; overscroll-contain stops the scroll
      // chaining to the locked body underneath.
      className={`fixed inset-0 z-50 flex overflow-y-auto overscroll-contain py-4 outline-none ${dim} ${alignment} ${justification} ${className}`}
    >
      {children}
    </div>
  );
}
