import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKRW(amount: number | null | undefined) {
  if (amount == null) return "-";
  return `${amount.toLocaleString("ko-KR")}원`;
}
