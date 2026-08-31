import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DbSync } from "@/components/DbSync";
import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/RouteFallbacks";
import { SITE_URL } from "@/lib/site";

import appCss from "../styles.css?url";


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f5f3ee" },
      { title: "Notaku — Catat & Cetak Struk UMKM" },
      { name: "description", content: "Aplikasi sat-set untuk UMKM: bikin nota, cetak struk, simpan riwayat dan pelanggan. Tanpa login, semua data di HP." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Notaku" },
      { property: "og:locale", content: "id_ID" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Async, non-blocking Google Fonts: load as media="print" so the browser
      // doesn't block render on it, then promote to all media via inline script
      // below once the stylesheet is parsed. (`onLoad` as a string attribute
      // is stripped by React, so we can't rely on the classic onLoad trick.)
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap",
        media: "print",
        "data-font": "google",
      } as any,
    ],
    scripts: [
      {
        children:
          "(function(){try{var t=localStorage.getItem('notaku-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}var l=document.querySelector('link[data-font=\"google\"]');if(l){if(l.sheet)l.media='all';else l.addEventListener('load',function(){l.media='all'});}})();",
      },

      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "Notaku",
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: "Notaku",
              description: "Aplikasi nota & struk gratis untuk UMKM Indonesia.",
              inLanguage: "id-ID",
              publisher: { "@id": `${SITE_URL}/#organization` },
            },
            {
              "@type": "SoftwareApplication",
              "@id": `${SITE_URL}/#app`,
              name: "Notaku",
              description: "Aplikasi nota dan struk gratis untuk UMKM Indonesia. Catat omset, cetak struk, kirim ke pelanggan via WhatsApp — tanpa login.",
              url: SITE_URL,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Android, iOS",
              inLanguage: "id-ID",
              offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
            },
          ],
        }),
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RouteNotFoundFallback,
  errorComponent: RouteErrorFallback,
});


function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).__notakuErrLog) return;
    (window as any).__notakuErrLog = true;
    const onError = (e: ErrorEvent) => {
      if (import.meta.env.DEV) console.error("[runtime-error]", `${e.filename}:${e.lineno}:${e.colno}`, e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (import.meta.env.DEV) console.error("[unhandled-rejection]", e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    // Register PWA service worker (no-op inside Lovable preview / iframes)
    import("@/lib/pwa").then((m) => m.registerServiceWorker()).catch(() => undefined);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
      <DbSync />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

