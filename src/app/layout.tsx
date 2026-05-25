import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import {
  BRAND_NAME,
  BRAND_SHORT,
  BRAND_COLOR,
  BRAND_DOMAIN,
  BRAND_DESCRIPTION,
} from "@/lib/brand";

// 외부 노출 메타데이터 전수 정리:
//   - metadataBase: 모든 상대 경로(og:image 등) 의 절대화 기준.
//   - title.template: 각 페이지의 짧은 title 을 자동으로 "X | 출장시민기사" 으로.
//   - openGraph / twitter: 카톡/Slack/페이스북/X 링크 미리보기 메타.
//   - 디자인 OG 이미지(1200x630) 미보유 → 임시로 /icon-512x512.png 사용.
//     향후 전용 OG 이미지 만들면 url 만 교체.
export const metadata: Metadata = {
  metadataBase: new URL(BRAND_DOMAIN),
  title: {
    default: BRAND_NAME,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
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
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    url: BRAND_DOMAIN,
    locale: "ko_KR",
    images: [
      {
        url: "/icon-512x512.png",
        width: 512,
        height: 512,
        alt: BRAND_NAME,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    images: ["/icon-512x512.png"],
  },
  formatDetection: {
    telephone: false,
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
        <meta name="apple-mobile-web-app-title" content={BRAND_SHORT} />
        <meta name="theme-color" content={BRAND_COLOR} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
        <Toaster position="top-center" richColors />
        <PWARegister />
      </body>
    </html>
  );
}
