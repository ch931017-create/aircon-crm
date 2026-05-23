import type { CallStatus } from "@/types/database";

export const STATUS_LABEL: Record<CallStatus, string> = {
  new: "대기",
  assigned: "잡음",
  on_the_way: "출발 중",
  working: "작업 중",
  scheduled: "예약",
  visiting: "방문중",
  completed: "완료",
  cancelled: "취소",
};

export const STATUS_BG: Record<CallStatus, string> = {
  new: "bg-emerald-100 text-emerald-700",
  assigned: "bg-cyan-100 text-cyan-700",
  on_the_way: "bg-orange-100 text-orange-700",
  working: "bg-amber-100 text-amber-700",
  scheduled: "bg-sky-100 text-sky-700",
  visiting: "bg-lime-100 text-lime-700",
  completed: "bg-slate-100 text-slate-500",
  cancelled: "bg-rose-100 text-rose-700",
};

export const STATUS_ORDER: CallStatus[] = [
  "new",
  "assigned",
  "on_the_way",
  "working",
  "scheduled",
  "visiting",
  "completed",
  "cancelled",
];
