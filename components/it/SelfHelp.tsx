"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/Icon";
import { GetITHelp } from "@/components/shell/GetITHelp";
import type { Profile } from "@/lib/database.types";

// Self-service IT help for everyone outside the IT department: fix the common
// things yourself, and raise a ticket when you can't.
const FIXES = [
  {
    icon: "wrench",
    title: "Projector or TV won't show anything",
    steps: [
      "Check the input/source on the display (HDMI 1, HDMI 2…).",
      "Unplug the HDMI cable at both ends, wait 5 seconds, plug it back in.",
      "Power-cycle the display: off, wait 10 seconds, on.",
      "Try a different HDMI cable if one is nearby.",
    ],
  },
  {
    icon: "chat",
    title: "No sound / mic not working",
    steps: [
      "Check the mic is on and the channel isn't muted at the board.",
      "Swap in a fresh battery — this fixes most wireless mic issues.",
      "Confirm the fader is up and the correct channel is selected.",
      "Check the receiver shows signal when you speak.",
    ],
  },
  {
    icon: "home",
    title: "Can't get on the WiFi",
    steps: [
      "Make sure you're joining the right network for your area.",
      "Forget the network on your device, then rejoin.",
      "Guest WiFi passwords change periodically — ask IT for the current one.",
    ],
  },
  {
    icon: "form",
    title: "Livestream problems",
    steps: [
      "Check the encoder/streaming software is actually running.",
      "Confirm the camera is powered and its output cable is seated.",
      "Look for a network warning in the streaming software.",
      "Note the exact time it happened — it helps IT find it in the logs.",
    ],
  },
];

export function SelfHelp({
  name,
  email,
  portalUrl,
}: {
  name: string;
  email: string;
  portalUrl: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">IT Support</h1>
      <p className="mt-1 text-ink-500">
        Try a quick fix below — if it doesn&apos;t work, send it to Arise IT.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => setHelpOpen(true)}
          className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-left transition hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-onaccent">
            <Icon name="help" />
          </span>
          <span>
            <span className="block font-display font-semibold text-ink-900">
              Submit a request
            </span>
            <span className="block text-sm text-ink-600">
              Your name and campus are filled in for you.
            </span>
          </span>
        </button>

        <a
          href={`${portalUrl}/go`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-4 transition hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-chrome-700 text-chrome-50">
            <Icon name="link" />
          </span>
          <span>
            <span className="block font-display font-semibold text-ink-900">
              Quick Access board
            </span>
            <span className="block text-sm text-ink-600">
              WiFi passwords & equipment info — needs an access code.
            </span>
          </span>
        </a>
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Try this first
      </h2>
      <div className="mt-2 space-y-2">
        {FIXES.map((f, i) => (
          <div key={f.title} className="overflow-hidden rounded-xl border border-ink-100 bg-white">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                <Icon name={f.icon} size={18} />
              </span>
              <span className="flex-1 font-medium text-ink-900">{f.title}</span>
              <span className="text-ink-400">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <ol className="list-decimal space-y-1.5 border-t border-ink-100 bg-ink-50 px-4 py-3 pl-9 text-sm text-ink-700">
                {f.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-ink-500">
        Still stuck?{" "}
        <button onClick={() => setHelpOpen(true)} className="font-medium text-brand-600 underline">
          Send it to Arise IT
        </button>{" "}
        and we&apos;ll take it from there.
      </p>

      {helpOpen && (
        <GetITHelp
          profile={{ full_name: name, email } as Profile}
          email={email}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  );
}
