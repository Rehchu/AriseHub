import type { Env } from "../types";

// Sends transactional email via Resend (https://resend.com). Fail-soft: if no
// RESEND_API_KEY is configured, or the send fails, we return false and never
// throw — user creation must succeed regardless of email delivery.

const DEFAULT_FROM = "Arise IT Portal <onboarding@resend.dev>";

/**
 * Who ticket mail comes from.
 *
 * myfaithtech.com is verified, and the church wanted ticket traffic to arrive as
 * AriseIT rather than as the portal's default sender — so a status change lands
 * in the same conversation as the rest of someone's IT history rather than
 * looking like a system notice from somewhere unfamiliar.
 *
 * AriseHub uses arisehub@ for anything about an ACCOUNT (password resets,
 * invitations); ariseit@ is for anything about a ticket. Overridable without a
 * deploy via IT_FROM_EMAIL.
 */
const TICKET_FROM = "AriseIT <ariseit@myfaithtech.com>";

async function send(env: Env, to: string, subject: string, html: string, from?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: from || env.FROM_EMAIL || DEFAULT_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("Resend send failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend send error", err);
    return false;
  }
}

function shell(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f6;font-family:Inter,Arial,Helvetica,sans-serif;color:#17171a">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#0b0b0c;border-radius:12px 12px 0 0;padding:18px 22px;color:#fff">
      <span style="font-weight:700;letter-spacing:.04em">ARISE <span style="color:#d2303b">IT</span></span>
      <span style="color:#a3a3aa;font-size:11px;letter-spacing:.12em;display:block">PORTAL</span>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px 22px">
      ${bodyHtml}
    </div>
    <div style="text-align:center;color:#9a9a9a;font-size:12px;padding:16px">Arise Church IT · Pineville, LA</div>
  </div></body></html>`;
}

function codeBox(label: string, value: string): string {
  return `<div style="margin:16px 0"><div style="font-size:12px;color:#777;text-transform:uppercase;letter-spacing:.06em">${label}</div>
    <div style="font-family:monospace;font-size:22px;font-weight:700;background:#f5f5f6;border:1px solid #e5e5e8;border-radius:8px;padding:10px 14px;margin-top:4px">${value}</div></div>`;
}

function button(url: string, text: string): string {
  return `<a href="${url}" style="display:inline-block;background:#d2303b;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px;margin-top:8px">${text}</a>`;
}

export function sendInviteEmail(
  env: Env,
  opts: { to: string; name: string; tempPassword: string; loginUrl: string }
): Promise<boolean> {
  const first = opts.name.split(" ")[0] || "there";
  const html = shell(
    `<p style="font-size:16px;margin:0 0 8px">Hi ${first},</p>
     <p style="margin:0 0 4px">You've been added to the <strong>Arise IT Portal</strong>. Sign in with the temporary password below, and you'll be asked to set your own password.</p>
     ${codeBox("Your email", opts.to)}
     ${codeBox("Temporary password", opts.tempPassword)}
     ${button(opts.loginUrl, "Sign in")}
     <p style="font-size:13px;color:#777;margin-top:16px">If you weren't expecting this, you can ignore this email.</p>`
  );
  return send(env, opts.to, "You've been added to Arise IT Portal", html);
}

// Notifies IT staff that a new request came in. `to` is one or more admin
// emails; sent individually. Fail-soft like the rest.
export async function sendTicketNotification(
  env: Env,
  opts: {
    to: string[];
    subject: string;
    requesterName: string;
    priority: string;
    category: string;
    campusName: string;
    description?: string | null;
    ticketUrl: string;
  }
): Promise<boolean> {
  if (!opts.to.length) return false;
  const html = shell(
    `<p style="font-size:16px;margin:0 0 8px">New IT request</p>
     <p style="font-size:18px;font-weight:700;margin:0 0 4px">${opts.subject}</p>
     <p style="margin:0 0 4px;color:#555">${opts.priority} priority · ${opts.category} · ${opts.campusName}</p>
     <p style="margin:4px 0 0;color:#555">From: ${opts.requesterName}</p>
     ${opts.description ? `<p style="margin:12px 0 0;white-space:pre-wrap">${opts.description}</p>` : ""}
     ${button(opts.ticketUrl, "Open request")}`
  );
  const results = await Promise.all(opts.to.map((addr) => send(env, addr, `New IT request: ${opts.subject}`, html)));
  return results.some(Boolean);
}

export function sendPasswordResetEmail(
  env: Env,
  opts: { to: string; name: string; tempPassword: string; loginUrl: string }
): Promise<boolean> {
  const first = opts.name.split(" ")[0] || "there";
  const html = shell(
    `<p style="font-size:16px;margin:0 0 8px">Hi ${first},</p>
     <p style="margin:0 0 4px">Your Arise IT Portal password has been reset. Use the temporary password below to sign in, then set a new one.</p>
     ${codeBox("Temporary password", opts.tempPassword)}
     ${button(opts.loginUrl, "Sign in")}
     <p style="font-size:13px;color:#777;margin-top:16px">If you didn't request this, contact your IT admin.</p>`
  );
  return send(env, opts.to, "Your Arise IT Portal password was reset", html);
}

/**
 * Tell a requester their ticket moved. Sent as AriseIT, not as the portal's
 * default sender — see TICKET_FROM.
 */
export async function sendStatusChange(
  env: Env,
  opts: {
    to: string;
    heading: string;
    line: string;
    subject: string;
    status: string;
    ticketUrl: string;
  }
): Promise<boolean> {
  const html = shell(
    `<p style="font-size:16px;margin:0 0 8px;font-weight:600">${opts.heading}</p>
     <p style="margin:0 0 12px">${opts.line}</p>
     <p style="margin:0 0 4px;color:#555"><strong>${opts.subject}</strong></p>
     <p style="margin:0 0 16px;color:#777;font-size:13px">Status: ${opts.status}</p>
     ${button(opts.ticketUrl, "View your request")}`
  );
  return send(
    env,
    opts.to,
    `Your IT request: ${opts.status}`,
    html,
    env.IT_FROM_EMAIL || TICKET_FROM
  );
}
