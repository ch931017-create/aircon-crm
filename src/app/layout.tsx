import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { BRAND_NAME, BRAND_SHORT, BRAND_COLOR } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: "출장 수리 기사 배정 및 고객 방문 관리 시스템",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_SHORT,
  },
  icons: {
   icon: "/favicon-32x32.png",
   apple: "/icon-192x192.png",
 },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: BRAND_COLOR,
  viewportFit: "cover",
};

function PWARegister() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
              try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                  scope: '/',
                });
                console.log('[PWA] Service Worker registered:', registration);
              } catch (error) {
                console.warn('[PWA] Service Worker registration failed:', error);
              }
            });
          }
        `,
      }}
    />
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="출장시민 기사앱" />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
        <Toaster position="top-center" richColors />
        <PWARegister />
      </body>
    </html>
  );
}
