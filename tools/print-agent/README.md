# AriseHub print agent — iPad / iPhone → Mac → DYMO

iPads and iPhones can't talk to a DYMO directly (DYMO Connect is desktop-only,
and browsers block a web page from reaching it anyway). This little program runs
on the **one Mac next to the printer** and prints on behalf of every device on
the same WiFi.

```
iPad / iPhone  ──(church WiFi, https)──►  this agent  ──►  DYMO Connect  ──►  DYMO
```

The badge prints exactly the same as when the Mac prints it directly — the iPad
just sends the finished label across the network.

## On the Mac by the printer (once)

The host is the Mac with the **DYMO plugged into USB**. It needs:

1. **DYMO Connect for Mac** installed and **open** (the same app that prints from
   the Mac directly).
2. **Node.js** — install from <https://nodejs.org> if it isn't already there.
3. This `print-agent` folder copied onto the Mac.

Then **double-click `start-print-agent.command`**. A Terminal window opens and
prints the address to use, e.g.:

```
  https://10.0.0.18:41952
```

Leave that window open during check-in. Closing it (or Ctrl+C) stops printing.

> First time only: macOS may block a downloaded `.command` file. If double-click
> does nothing, **right-click it → Open** and confirm once (or run
> `chmod +x start-print-agent.command` in Terminal). After that, double-click
> works normally.

> The address is the Mac's own network address. If it changes (different
> building, new WiFi), the agent notices and re-issues its certificate
> automatically — iPads just accept it once more (below).

## On each iPad / iPhone (once per device)

1. In **Safari**, open the address the window printed, with `/status` on the
   end — e.g. `https://10.0.0.18:41952/status`. Tap through the certificate
   warning (Show Details → visit this website). You should see `{"ok":true,...}`.
   *(One-time trust step; the certificate is self-signed because no authority
   issues certs for a `10.0.0.x` address.)*
2. In AriseHub: **Check-In → Name tags → Print server**, enter the same address
   (`https://10.0.0.18:41952`) and save.

That device now prints check-in badges to the Mac's DYMO. The setting is saved
per device, so you only do this once each.

## Print order

Each check-in tries, in order: DYMO Connect on the device itself → **this agent**
→ the browser's print dialog. A Mac with its own DYMO uses the first; iPads and
iPhones fall through to the agent.

## If it doesn't print

- **Nothing happens on an iPad:** confirm the agent window is open on the Mac,
  the `/status` page showed `{"ok":true}` in Safari on that iPad, and the Print
  server address matches what the window prints.
- **The window says "DYMO Connect not detected":** open DYMO Connect on the Mac
  and make sure the printer is on USB, then restart the agent.
- **The address changed:** re-open `/status` on each iPad to re-accept the new
  certificate.
