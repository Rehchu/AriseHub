"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/Icon";
import { GetITHelp } from "@/components/shell/GetITHelp";
import type { Profile } from "@/lib/database.types";

const IT_PORTAL =
  process.env.NEXT_PUBLIC_IT_PORTAL_URL ?? "https://itportal.myfaithtech.com";

// AriseHub's IT module. Ticketing is inline (posts to the IT Worker's API);
// asset/WiFi/licence management opens the IT portal itself, which runs as its
// own Cloudflare Worker with its own D1 database.
export function ITPortal({
  name,
  email,
  isItAdmin,
}: {
  name: string;
  email: string;
  isItAdmin: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  const adminLinks = [
    { href: `${IT_PORTAL}/assets`, icon: "wrench", title: "Assets & Equipment", body: "Inventory, check-out, maintenance, QR labels" },
    { href: `${IT_PORTAL}/wifi`, icon: "home", title: "WiFi Vault", body: "Network credentials per campus" },
    { href: `${IT_PORTAL}/requests`, icon: "task", title: "Ticket Queue", body: "Triage and resolve IT requests" },
    { href: `${IT_PORTAL}/consumables`, icon: "form", title: "Consumables", body: "Stock levels and low-stock alerts" },
    { href: `${IT_PORTAL}/licenses`, icon: "form", title: "Licenses", body: "Software seats and renewals" },
    { href: `${IT_PORTAL}/access-passes`, icon: "link", title: "Quick Access", body: "Guest codes and printable posters" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">IT Support</h1>
      <p className="mt-1 text-ink-500">
        Get help with anything tech — sound booth, livestream, projectors, WiFi,
        computers, printers.
      </p>

      {/* Primary action for everyone */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => setHelpOpen(true)}
          className="flex flex-col rounded-xl border border-brand-100 bg-brand-50 p-5 text-left transition hover:shadow-md"
        >
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Icon name="help" />
          </span>
          <h3 className="font-display font-semibold text-ink-900">Submit a request</h3>
          <p className="mt-1 text-sm text-ink-600">
            Your name and contact info are filled in automatically — just describe
            the problem.
          </p>
        </button>

        <a
          href={`${IT_PORTAL}/requests`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col rounded-xl border border-ink-100 bg-white p-5 transition hover:shadow-md"
        >
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-ink-700 text-white">
            <Icon name="task" />
          </span>
          <h3 className="font-display font-semibold text-ink-900">My requests</h3>
          <p className="mt-1 text-sm text-ink-500">
            Track the status of tickets you&apos;ve submitted.
          </p>
        </a>
      </div>

      {isItAdmin && (
        <div className="mt-10">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
            IT administration
          </h2>
          <p className="mb-3 text-sm text-ink-500">
            Equipment, WiFi, and licensing live in the IT service — opens in a new tab.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {adminLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col rounded-xl border border-ink-100 bg-white p-4 transition hover:shadow-md"
              >
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                  <Icon name={l.icon} size={18} />
                </span>
                <p className="font-medium text-ink-900">{l.title}</p>
                <p className="mt-0.5 text-xs text-ink-500">{l.body}</p>
              </a>
            ))}
          </div>
        </div>
      )}

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
