// Transactional email via Resend. myfaithtech.com is a verified domain, so
// AriseHub sends as arisehub@myfaithtech.com.
//
// Never throws — a failed email must not fail the action that triggered it.

const FROM = process.env.FROM_EMAIL || "AriseHub <arisehub@myfaithtech.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "email not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Branded shell so every AriseHub email looks the same. */
export function emailLayout(title: string, bodyHtml: string) {
  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto">
    <div style="background:#0b0b0c;padding:20px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-size:20px;font-weight:700">Arise<span style="color:#d2303b">Hub</span></span>
    </div>
    <div style="border:1px solid #e2e2e4;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="margin:0 0 12px;color:#0b0b0c;font-size:18px">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="color:#9a9ba1;font-size:12px;text-align:center;margin-top:16px">
      Arise Church · Pineville, LA
    </p>
  </div>`;
}

export function buttonHtml(href: string, label: string) {
  return `<p style="margin:24px 0">
    <a href="${href}" style="background:#d2303b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${label}</a>
  </p>
  <p style="color:#6d6e76;font-size:13px">If the button doesn't work, paste this into your browser:<br>
    <span style="word-break:break-all">${href}</span>
  </p>`;
}
