import Image from "next/image";
import { signOutAction } from "@/actions/auth";
import type { ProfileRow } from "@/types/database";
import { BRAND_NAME } from "@/lib/brand";

const ROLE_LABEL: Record<ProfileRow["role"], string> = {
  admin: "관리자",
  dispatcher: "콜직원",
  technician: "기사",
};

export function Header({ profile }: { profile: ProfileRow }) {
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-emerald-100 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-screen-md items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500 shadow-md shadow-emerald-100">
            <Image
              src="/icon-192x192.png"
              alt="출장시민"
              width={44}
              height={44}
              className="h-11 w-11"
              priority
            />
          </div>

          <div>
            <p className="text-[15px] font-extrabold leading-tight text-emerald-700">
              {BRAND_NAME}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {profile.name} · {ROLE_LABEL[profile.role]}
            </p>
          </div>
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 active:scale-95"
          >
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}