import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AriseHub",
  description: "Arise Church — one app for people, check-in, groups, services & IT.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AriseHub",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  // No maximumScale. It was set to 1 to stop iOS zooming when an input takes
  // focus, but that also disables pinch-zoom for everybody — WCAG 1.4.4, and a
  // real problem for the older members reading a service plan on a phone. The
  // focus-jump is fixed properly in globals.css instead: iOS only zooms when
  // the field's font is under 16px, so every control is pinned to 16px there.
  viewportFit: "cover", // extend under the iOS notch / safe areas
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Inter is the redesign's one family (headings by size, not weight);
            Poppins stays loaded for the tag designer's font list. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Applied before paint — a dark-mode phone must not flash white. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Nocturne is the app's direction, so dark is the DEFAULT rather
              // than following the OS — an explicit choice still wins.
              "try{var t=localStorage.getItem('arisehub-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
