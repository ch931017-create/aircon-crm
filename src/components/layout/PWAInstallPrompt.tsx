"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua);

    // iOS는 beforeinstallprompt를 지원하지 않으므로, standalone 모드가 아닐 때 안내 표시
    if (isIOSDevice) {
      setIsIOS(true);
      const isPWAInstalled = (window.navigator as any).standalone === true;
      const dismissedThisSession =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("pwa-dismissed") === "1";
      if (!isPWAInstalled && !dismissedThisSession) {
        setShowPrompt(true);
      }
    }

    // iOS 외 (Android / Desktop Chrome / Edge 등): beforeinstallprompt 수신 시 표시
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissedThisSession =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("pwa-dismissed") === "1";
      if (!dismissed && !dismissedThisSession) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [dismissed]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        console.log("[PWA] User accepted install");
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("pwa-dismissed", "1");
    }
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white p-4 shadow-2xl">
      {isIOS ? (
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-slate-900">홈화면에 추가</p>
            <p className="text-xs text-slate-500 mt-1">
              더 편하게 사용하려면 아래 공유 버튼을 누르세요.
            </p>
          </div>
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl space-y-2">
            <p className="font-medium">iPhone/iPad 설치 방법:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>공유 버튼 클릭 (하단 네모 화살표)</li>
              <li>&quot;홈 화면에 추가&quot; 선택</li>
              <li>이름 확인 후 추가</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="font-semibold text-slate-900">앱 설치</p>
            <p className="text-xs text-slate-500 mt-1">
              홈화면에 설치해서 앱처럼 사용하세요.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg p-1.5 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={20} className="text-slate-400" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 whitespace-nowrap"
          >
            설치
          </button>
        </div>
      )}
    </div>
  );
}
