/**
 * Print a standalone HTML document without opening a window.
 *
 * The browser dialog is the LAST link in the print chain: DYMO Connect on this
 * machine, then the shared print agent, then this. So by the time it runs, a
 * volunteer is standing at a tablet with a child in front of them and no label.
 * Opening a pop-up to get there is a bad bet — kiosk tablets block them, and
 * the old code's response was an alert() nobody was watching for.
 *
 * A same-origin iframe needs no permission and no user gesture.
 */
export function printHtmlInFrame(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Name tag print view");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    alert("This browser wouldn't open a print view for the name tag.");
    return;
  }

  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    try {
      win.focus();
      win.print();
    } finally {
      // Safari and Firefox return from print() before the dialog is dismissed,
      // so tearing the frame down immediately can cancel the job.
      setTimeout(() => frame.remove(), 2000);
    }
  };

  doc.open();
  doc.write(html);
  doc.close();

  // The rendered tag is an image, and printing before it has decoded prints a
  // blank label — which looks exactly like a printer fault and isn't one.
  const pending = Array.from(doc.images).filter((i) => !i.complete);
  if (pending.length === 0) {
    setTimeout(go, 50); // one tick, so @page and layout have applied
    return;
  }
  let left = pending.length;
  const tick = () => {
    if (--left <= 0) setTimeout(go, 50);
  };
  for (const img of pending) {
    img.addEventListener("load", tick, { once: true });
    img.addEventListener("error", tick, { once: true });
  }
  // Never leave someone waiting on an image that will never resolve.
  setTimeout(go, 4000);
}
