import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
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
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#F6F3EC" />
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
