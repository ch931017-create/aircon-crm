import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { MapPin, Phone, Clock } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { formatKRW } from "@/lib/utils";
import type { CallRow, ProfileRow } from "@/types/database";

export interface CallCardProps {
  call: CallRow;
  assigneeName?: string | null;
  isMine?: boolean;
  rightSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
}

export function CallCard({
  call,
  assigneeName,
  isMine,
  rightSlot,
  footerSlot,
}: CallCardProps) {

  const isHappyCallDone = Boolean(call.customer_confirmed_at);

const isAmountMismatch =
  call.customer_amount != null &&
  call.paid_amount != null &&
  Number(call.customer_amount) !== Number(call.paid_amount);
  

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      
                  <div className="bg-black text-white text-xs p-2 mb-2">
        고객금액: {String(call.customer_amount)} /
        기사금액: {String(call.paid_amount)} /
        불일치: {String(isAmountMismatch)}
      </div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">
              {call.customer_name}
            </h3>
            <StatusBadge status={call.status} />
            {assigneeName && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                {assigneeName}
              </span>
            )}
            {isMine && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                내 콜
              </span>
            )}

            {call.status === "completed" && (
  isAmountMismatch ? (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
      금액 불일치
    </span>
  ) : isHappyCallDone ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
      해피콜 완료
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
      해피콜 미완료
    </span>
  )
)}
          </div>
          {call.district && (
            <p className="mt-0.5 text-xs text-slate-500">{call.district}</p>
          )}
        </div>
        {rightSlot}
      </div>

      <dl className="space-y-1.5 text-sm text-slate-700">
        <Row Icon={Phone}>
          <a href={`tel:${call.phone}`} className="underline-offset-2 hover:underline">
            {call.phone}
          </a>
        </Row>
        <Row Icon={MapPin}>
          <span className="truncate">{call.address}</span>
        </Row>
        {call.preferred_time && (
          <Row Icon={Clock}>
            희망{" "}
            {format(new Date(call.preferred_time), "M/d (EEE) HH:mm", {
              locale: ko,
            })}
          </Row>
        )}
      </dl>

      {call.symptom && (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {call.symptom}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between text-xs text-slate-500">
        <div>
          {call.estimated_amount != null && (
            <p>예상 {formatKRW(call.estimated_amount)}</p>
          )}
          {call.paid_amount != null && (
            <p className="text-emerald-700">결제 {formatKRW(call.paid_amount)}</p>
          )}
        </div>
        <span title={call.created_at}>
          {formatDistanceToNow(new Date(call.created_at), {
            locale: ko,
            addSuffix: true,
          })}
        </span>
      </div>

      {footerSlot && <div className="mt-3">{footerSlot}</div>}
    </article>
  );
}

function Row({
  Icon,
  children,
}: {
  Icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export type ProfileMap = Map<string, Pick<ProfileRow, "name" | "role">>;
