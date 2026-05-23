import { STATUS_BG, STATUS_LABEL } from "@/lib/call-meta";
import type { CallStatus } from "@/types/database";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: CallStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        STATUS_BG[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
