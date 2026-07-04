import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  // Optical size axis: display-grade cut (sharp serifs, high contrast) at
  // heading sizes — without this, every size renders the soft 9pt text cut.
  axes: ["opsz"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SRS Quiz System",
  description: "Spaced Repetition Quiz Generator & Grader",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    // Translucent so the paper app bar extends under the status bar (no visible
    // seam at the top). The mobile top bar pads with safe-area-inset-top.
    statusBarStyle: "black-translucent",
    title: "SRS Quiz",
  },
};

// Mobile + iPad: real device width, allow pinch-zoom (a11y), and extend under
// notches/home indicators so we can pad with safe-area insets in CSS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F3EC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#F6F3EC" />
        {/* Appearance no-flash script — sets data-theme/data-accent BEFORE first
            paint from localStorage, resolves "auto" live via matchMedia, and
            exposes window.__srsAppearance for the Settings UI (APPEARANCE.md). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var KEY = "srsAppearance";
                var ACCENTS = ["amber", "slate", "eucalyptus", "heather", "graphite"];
                var mq = window.matchMedia("(prefers-color-scheme: dark)");
                function read() {
                  var s = {};
                  try { s = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
                  return {
                    mode: (s.mode === "ink" || s.mode === "auto" || s.mode === "paper") ? s.mode : "paper",
                    accent: ACCENTS.indexOf(s.accent) >= 0 ? s.accent : "amber"
                  };
                }
                function resolve(mode) { return mode === "auto" ? (mq.matches ? "ink" : "paper") : mode; }
                var fadeT;
                function apply(pref, fade) {
                  var el = document.documentElement;
                  var theme = resolve(pref.mode);
                  if (fade && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    el.setAttribute("data-appearance-fade", "");
                    clearTimeout(fadeT);
                    fadeT = setTimeout(function () { el.removeAttribute("data-appearance-fade"); }, 450);
                  }
                  el.setAttribute("data-theme", theme);
                  el.setAttribute("data-accent", pref.accent);
                  var m = document.querySelector('meta[name="theme-color"]');
                  if (m) m.setAttribute("content", theme === "ink" ? "#1B1713" : "#F6F3EC");
                }
                apply(read(), false);
                var onChange = function () { var p = read(); if (p.mode === "auto") apply(p, true); };
                if (mq.addEventListener) mq.addEventListener("change", onChange);
                else if (mq.addListener) mq.addListener(onChange);
                window.__srsAppearance = {
                  get: read,
                  set: function (patch) {
                    var cur = read();
                    var next = {
                      mode: patch && patch.mode ? patch.mode : cur.mode,
                      accent: patch && patch.accent ? patch.accent : cur.accent
                    };
                    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
                    apply(next, true);
                  },
                  resolve: resolve
                };
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans selection:bg-amber-500/20 selection:text-ink-900">
        <Providers>
          {children}
        </Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js')
                  .then(reg => console.log('SW registered:', reg.scope))
                  .catch(err => console.error('SW registration failed:', err));
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
