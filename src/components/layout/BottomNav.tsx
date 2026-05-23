"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileText,
  ListChecks,
  MapPin,
  PhoneCall,
  Shield,
  Wallet,
} from "lucide-react";
import type { UserRole } from "@/types/database";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof ClipboardList;
}

function itemsFor(role: UserRole): NavItem[] {
  const base: NavItem[] = [
    { href: "/calls", label: "전체콜", Icon: ClipboardList },
    { href: "/calls/map", label: "지도", Icon: MapPin },
  ];

  if (role === "technician") {
    base.push({ href: "/my-calls", label: "내콜", Icon: ListChecks });
    base.push({ href: "/my-settlements", label: "정산", Icon: Wallet });
  }

  if (role === "dispatcher" || role === "admin") {
    base.push({ href: "/calls/new", label: "등록", Icon: PhoneCall });
    base.push({
      href: "/admin/tax-invoices",
      label: "세금계산서",
      Icon: FileText,
    });
  }

  if (role === "admin") {
    base.push({ href: "/admin/settlements", label: "정산", Icon: Wallet });
    base.push({ href: "/admin", label: "관리", Icon: Shield });
  }

  return base;
}

export function BottomNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = itemsFor(role);

  return (
    <nav className="safe-bottom sticky bottom-0 z-30 border-t border-emerald-100 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <ul
        className="mx-auto grid max-w-screen-md px-2 pb-1 pt-1.5"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href;

          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-all",
                  active
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                    : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700",
                )}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.8 : 2.2}
                  className={cn(active ? "text-white" : "text-slate-500")}
                />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}