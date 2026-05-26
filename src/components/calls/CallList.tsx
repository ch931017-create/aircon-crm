"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "./StatusBadge";
import { formatKRW } from "@/lib/utils";
import { toast } from "sonner";
import type { CallRow, ProfileRow } from "@/types/database";

const STATUS_FILTERS: Array<{ key: "all" | "new" | "mine" | "completed" | "cancelled"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "new", label: "대기중" },
  { key: "mine", label: "내 콜" },
  { key: "completed", label: "완료" },
  { key: "cancelled", label: "취소" },
];

type SortKey = "latest" | "amount" | "preferred_time" | "distance";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "latest", label: "최신순" },
  { key: "preferred_time", label: "희망시간순" },
];

const TECHNICIAN_SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "latest", label: "최신순" },
  { key: "distance", label: "가까운 거리순" },
];

const RADIUS_OPTIONS: Array<{ value: 5 | 10 | 20 | "all"; label: string }> = [
  { value: 5, label: "5km" },
  { value: 10, label: "10km" },
  { value: 20, label: "20km" },
  { value: "all", label: "전체" },
];

const HIDDEN_STATUSES: Array<CallRow["status"]> = [
  "on_the_way",
  "working",
  "scheduled",
  "visiting",
];

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function formatPreferredTime(value?: string | null) {
  if (!value) return "-";
  return format(new Date(value), "M/d (EEE) HH:mm", { locale: ko });
}

const PAGE_SIZE = 50;
const REMINDER_MINUTES = 5;

function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const audioCtx = new window.AudioContext();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 440;
    oscillator.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.12);
  } catch {
    // ignore audio issues
  }
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

interface Props {
  currentUserId: string;
  currentUserRole: ProfileRow["role"];
  initialCalls: CallRow[];
  profiles: Array<Pick<ProfileRow, "id" | "name" | "role">>;
  emptyText?: string;
  filterMine?: boolean;
}

export function CallList({
  currentUserId,
  currentUserRole,
  initialCalls,
  profiles,
  emptyText,
  filterMine,
}: Props) {
  const router = useRouter();
  const [calls, setCalls] = useState<CallRow[]>(initialCalls);

  // server component(CallsPage / MyCallsPage)가 재실행되어 새 initialCalls가
  // 들어오면 client state도 동기화.
  // 정책 (운영 결정):
  //   - 삭제 후 router.refresh() 의존 제거 (handleDelete / handleBulkDelete).
  //   - 따라서 삭제 직후 stale initialCalls 가 들어와 race 일으킬 가능성 0.
  //   - 같은 세션 삭제→복원→/calls 재진입 시 fresh initialCalls 그대로 반영 → 즉시 표시.
  //   - 다른 page 로의 full navigation 은 Next.js 가 force-dynamic 으로 fresh fetch.
  // 단점: /calls page header 의 calls.length(SSR) 가 다음 nav 까지 잠시 stale.
  //       카드 UI 는 정확. 다음 nav 시 자동 갱신.
  useEffect(() => {
    setCalls(initialCalls);
  }, [initialCalls]);
  const [filter, setFilter] = useState<"all" | "new" | "mine" | "completed" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [region, setRegion] = useState("");
  // 'all' = 전체, 'unassigned' = 미배정, 그 외는 기사 ID
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("latest");
  const [radius, setRadius] = useState<5 | 10 | 20 | "all">("all");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [claimingCallId, setClaimingCallId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  // bulk selection (admin only). visible 변동 시 자동 prune.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState<
    "new" | "assigned" | "cancelled"
  >("cancelled");
  const [bulkStatusing, setBulkStatusing] = useState(false);
  const BULK_DELETE_MAX = 50;
  const BULK_STATUS_MAX = 50;
  const isAdmin = currentUserRole === "admin";
  // 일반 레이아웃 필터 패널 accordion (기본 접힘 — 모바일 세로 공간 절약).
  // 같은 탭/세션 동안만 펼침 상태 유지 (페이지 이동 후 돌아와도 유지).
  // sessionStorage 사용 → 브라우저/PWA 재시작 시 다시 default(접힘).
  const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [page, setPage] = useState(1);

  const notifiedCallIds = useRef<Set<string>>(new Set());
  const reminderCallIds = useRef<Set<string>>(new Set());

  // 알림 토글 latest value 를 realtime handler 안에서 안전하게 읽기 위한 refs.
  // 이전엔 channel useEffect deps 에 notificationEnabled/notificationPermission/
  // soundEnabled 가 있어서 토글마다 channel re-subscribe 발생 → 작은 성능 손실.
  // refs 로 우회 + deps [] → 마운트 시 1회만 구독.
  const notificationEnabledRef = useRef(false);
  const notificationPermissionRef = useRef<NotificationPermission>("default");
  const soundEnabledRef = useRef(true);

  const profileMap = useMemo(() => {
    const map = new Map<string, { name: string; role: ProfileRow["role"] }>();
    profiles.forEach((profile) => map.set(profile.id, { name: profile.name, role: profile.role }));
    return map;
  }, [profiles]);

  const sortOptions = filterMine ? TECHNICIAN_SORT_OPTIONS : SORT_OPTIONS;

  useEffect(() => {
    if (sortBy === "distance" && (!filterMine || !location)) {
      setSortBy("latest");
    }
    if (typeof window === "undefined") return;
    const storedNotification = window.localStorage.getItem("callNotificationEnabled");
    const storedSound = window.localStorage.getItem("callNotificationSoundEnabled");
    if (storedNotification !== null) setNotificationEnabled(storedNotification === "true");
    if (storedSound !== null) setSoundEnabled(storedSound === "true");
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("callNotificationEnabled", notificationEnabled ? "true" : "false");
  }, [notificationEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("callNotificationSoundEnabled", soundEnabled ? "true" : "false");
  }, [soundEnabled]);

  // /settings 페이지(다른 탭 또는 같은 탭 SPA 이동)에서 변경된 알림 설정을
  // 실시간 반영. 같은 탭은 컴포넌트 재마운트 시 위 useEffect로 읽지만,
  // 다른 탭 동시 사용 케이스 대비 storage 이벤트로 동기화.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key === "callNotificationEnabled" && e.newValue !== null) {
        setNotificationEnabled(e.newValue === "true");
      }
      if (e.key === "callNotificationSoundEnabled" && e.newValue !== null) {
        setSoundEnabled(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // 필터 패널 펼침 상태 sessionStorage 동기화 (탭/세션 단위 유지).
  // 마운트 시 1회 읽기: 사용자가 페이지 이동 후 돌아오면 이전 상태 복원.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("callListFilterPanelOpen") === "true") {
      setFilterPanelOpen(true);
    }
  }, []);

  // 사용자가 toggle할 때마다 저장. 브라우저 종료 시 자동 폐기.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      "callListFilterPanelOpen",
      filterPanelOpen ? "true" : "false",
    );
  }, [filterPanelOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !notificationEnabled || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
      });
    } else {
      setNotificationPermission(Notification.permission);
    }
  }, [notificationEnabled]);

  // 알림 토글 latest value 를 ref 로 동기화 (channel handler 가 stale closure 회피).
  useEffect(() => {
    notificationEnabledRef.current = notificationEnabled;
  }, [notificationEnabled]);
  useEffect(() => {
    notificationPermissionRef.current = notificationPermission;
  }, [notificationPermission]);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // realtime channel — 마운트 시 1회만 구독 (deps []).
  // notification 토글로 인한 재구독 churn 제거 → 모바일 체감 성능 개선.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("calls-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls" },
        (payload) => {
          const row = payload.new as CallRow;
          // soft delete 가드 #3-a (realtime INSERT 방어):
          // INSERT 시점 deleted_at은 일반적으로 null이지만, race condition이나
          // 옛 row 재insert 같은 edge case에서도 deleted row가 목록에 안 들어오게.
          if (row.deleted_at) return;

          setCalls((prev) => {
            if (prev.some((c) => c.id === row.id)) return prev;
            return [row, ...prev];
          });

          if (row.status === "new" && !notifiedCallIds.current.has(row.id)) {
            notifiedCallIds.current.add(row.id);
            toast.success(`새 콜 등록: ${row.district ?? "지역 미정"} ${row.address}`);
            // ref 로 최신값 접근 → 토글로 channel re-subscribe 불필요.
            if (soundEnabledRef.current) playNotificationSound();
            if (
              notificationEnabledRef.current &&
              notificationPermissionRef.current === "granted"
            ) {
              showBrowserNotification("새 콜 알림", `${row.customer_name} ${row.phone} ${row.district ?? ""}`);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls" },
        (payload) => {
          const row = payload.new as CallRow;
          // soft delete 가드 #3-b (realtime UPDATE 본체):
          // 본인 외 다른 admin/dispatcher가 삭제하면 realtime UPDATE로 deleted_at 채워진 row가 옴.
          // 이 시점에서 즉시 로컬 state에서 제거. 이전엔 map 업데이트만 해서 화면에 잔존했음.
          if (row.deleted_at) {
            setCalls((prev) => prev.filter((c) => c.id !== row.id));
            return;
          }
          setCalls((prev) => prev.map((c) => (c.id === row.id ? row : c)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "calls" },
        (payload) => {
          const id = (payload.old as CallRow).id;
          setCalls((prev) => prev.filter((c) => c.id !== id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // deps []: 마운트 시 1회만 구독. 토글 latest 는 refs 로 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동 geolocation 요청 제거 (운영 정책):
  //   - 카카오 인앱브라우저 / Android overlay 상태에서 mount 시 자동 요청 →
  //     "이 사이트에서는 권한을 요청할 수 없음" 에러 반복 발생.
  //   - 위치는 "내 위치 갱신" 버튼(handleUpdateLocation) 으로만 수동 요청.
  //   - 위치 없어도 콜 목록/내콜 렌더링은 정상. 거리순 정렬은 disabled 됨.

  useEffect(() => {
    const checkReminders = () => {
      const threshold = Date.now() - REMINDER_MINUTES * 60 * 1000;
      calls.forEach((call) => {
        if (call.status !== "new") return;
        if (reminderCallIds.current.has(call.id)) return;
        const createdAt = new Date(call.created_at).getTime();
        if (createdAt > threshold) return;

        reminderCallIds.current.add(call.id);
        toast(`재알림: ${call.district ?? "지역 미정"} ${call.address} 콜이 ${REMINDER_MINUTES}분 동안 미선점 상태입니다.`, {
          action: {
            label: "상세 보기",
            onClick: () => void router.push(`/calls/${call.id}`),
          },
        });
        if (soundEnabled) playNotificationSound();
        if (notificationEnabled && notificationPermission === "granted") {
          showBrowserNotification("콜 재알림", `${call.address} 콜이 ${REMINDER_MINUTES}분 동안 미선점 상태입니다.`);
        }
      });
    };

    checkReminders();
    const interval = window.setInterval(checkReminders, 60000);
    return () => window.clearInterval(interval);
  }, [calls, notificationEnabled, notificationPermission, router, soundEnabled]);

  useEffect(() => {
    setPage(1);
  }, [filter, search, region, selectedDate, sortBy, radius, filterMine, currentUserId, technicianFilter]);

  const technicianOptions = useMemo(
    () => profiles.filter((profile) => profile.role === "technician"),
    [profiles],
  );

  const showTechnicianFilter =
    !filterMine &&
    (currentUserRole === "dispatcher" || currentUserRole === "admin");

  async function claimCall(callId: string) {
    setActionError(null);
    setClaimingCallId(callId);
    try {
      const res = await fetch("/api/calls/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "콜 잡기에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch (err) {
      setActionError("콜 잡기에 실패했습니다.");
    } finally {
      setClaimingCallId(null);
    }
  }

  async function handleRelease(callId: string) {
    setActionError(null);
    setActionLoadingId(callId);
    try {
      const res = await fetch("/api/calls/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "반납에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setActionError("반납에 실패했습니다.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(callId: string, customerName: string) {
    const reason = window.prompt(
      `"${customerName}" 콜을 삭제합니다.\n삭제 사유(선택, 비워도 됨):`,
      "",
    );
    if (reason === null) return; // 취소
    if (
      !window.confirm(
        "정말 휴지통으로 이동하시겠습니까? admin/dispatcher가 휴지통에서 복원 가능합니다.",
      )
    ) {
      return;
    }

    setDeleteLoadingId(callId);
    try {
      const res = await fetch("/api/calls/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId, reason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data?.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "COMPLETED_CALL_CANNOT_BE_DELETED"
            ? "완료된 콜은 삭제할 수 없습니다."
            : code === "ALREADY_DELETED"
              ? "이미 삭제된 콜입니다."
              : code === "FORBIDDEN"
                ? "삭제 권한이 없습니다."
                : code;
        throw new Error(friendly);
      }
      toast.success("콜이 휴지통으로 이동되었습니다");
      // 로컬 상태에서 즉시 제거. router.refresh() 의도적 미호출:
      //   - refresh 호출 시 SSR fetch race 로 deleted call 이 잠시 다시 보이는 회귀 발생.
      //   - 휴지통/다른 page 카운트는 다음 nav 시 자동으로 fresh fetch (force-dynamic).
      //   - 다른 admin/dispatcher 클라이언트는 realtime UPDATE 로 자동 반영.
      setCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleteLoadingId(null);
    }
  }

  // selectedIds 갱신 규칙 (중요):
  //   - React state로 들고 있는 Set은 절대 직접 mutate 금지.
  //   - 모든 갱신은 `new Set(prev)` 또는 `new Set([...])` 로 새 인스턴스 만든 뒤
  //     add/delete → setSelectedIds(next) 형태로만.
  //   - prev를 그대로 add/delete 하면 reference 동일이라 React 렌더 누락 + 캡처된
  //     클로저(다른 useMemo/useEffect)와 충돌 가능.
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      // new Set(prev): 새 인스턴스. 이후 add/delete는 next에만 영향.
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    // 새 빈 Set으로 교체. 기존 prev 미터치.
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > BULK_DELETE_MAX) {
      toast.error(`한 번에 최대 ${BULK_DELETE_MAX}건까지 삭제 가능합니다.`);
      return;
    }
    const count = selectedIds.size;
    if (
      !window.confirm(
        `정말 선택한 ${count}건 콜을 삭제하시겠습니까?\n` +
          `삭제된 콜은 휴지통으로 이동합니다.\n` +
          `완료된 콜은 자동 제외됩니다.`,
      )
    ) {
      return;
    }

    const ids = Array.from(selectedIds);
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/calls/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: number;
        skipped?: number;
        failed?: number;
        details?: { success?: string[] };
        error?: string;
        limit?: number;
      };
      if (!res.ok) {
        const code = data.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "FORBIDDEN"
            ? "권한이 없습니다."
            : code === "TOO_MANY"
              ? `한 번에 최대 ${data.limit ?? BULK_DELETE_MAX}건까지 삭제 가능합니다.`
              : code === "MISSING_CALL_IDS"
                ? "선택된 콜이 없습니다."
                : code;
        throw new Error(friendly);
      }

      // 성공한 ID만 로컬 state에서 즉시 제거. skipped/failed 는 그대로 표시 유지.
      // router.refresh() 의도적 미호출 (위 단건 handleDelete 와 동일 사유).
      const successIds = new Set(data.details?.success ?? []);
      if (successIds.size > 0) {
        setCalls((prev) => prev.filter((c) => !successIds.has(c.id)));
      }
      // 처리된 ID들은 선택에서 모두 해제 (skipped/failed도 다시 선택 안 함)
      setSelectedIds(new Set());

      const s = data.success ?? 0;
      const k = data.skipped ?? 0;
      const f = data.failed ?? 0;
      let msg = `${s}건 삭제`;
      if (k > 0) msg += ` · ${k}건 스킵`;
      if (f > 0) msg += ` · ${f}건 실패`;
      if (f > 0) toast.error(msg);
      else if (k > 0) toast.message(msg);
      else toast.success(msg);

      // router.refresh() 의도적 미호출 — handleDelete 와 동일 사유.
      // 휴지통/다른 page 카운트는 다음 nav 시 자동 fresh fetch.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 삭제 실패");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkStatus() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > BULK_STATUS_MAX) {
      toast.error(`한 번에 최대 ${BULK_STATUS_MAX}건까지 변경 가능합니다.`);
      return;
    }
    const count = selectedIds.size;
    // bulk UI 전용 라벨 — 운영자 직관 우선.
    // (StatusBadge 등 기존 화면의 "잡음" 라벨은 그대로 유지. bulk select/confirm만 "배정됨" 사용.)
    const targetLabel =
      bulkStatusTarget === "new"
        ? "대기"
        : bulkStatusTarget === "assigned"
          ? "배정됨"
          : "취소";
    if (
      !window.confirm(
        `선택한 ${count}건 콜의 상태를 "${targetLabel}"(으)로 변경하시겠습니까?\n` +
          `완료된 콜도 함께 변경됩니다 (완료시각은 해제됨).\n` +
          `이미 같은 상태인 콜과 삭제된 콜은 자동 제외됩니다.`,
      )
    ) {
      return;
    }

    const ids = Array.from(selectedIds);
    setBulkStatusing(true);
    try {
      const res = await fetch("/api/calls/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: ids, status: bulkStatusTarget }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: number;
        skipped?: number;
        failed?: number;
        details?: { success?: string[] };
        error?: string;
        limit?: number;
      };
      if (!res.ok) {
        const code = data.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "FORBIDDEN"
            ? "권한이 없습니다."
            : code === "TOO_MANY"
              ? `한 번에 최대 ${data.limit ?? BULK_STATUS_MAX}건까지 변경 가능합니다.`
              : code === "INVALID_STATUS"
                ? "허용되지 않은 상태입니다."
                : code === "MISSING_CALL_IDS"
                  ? "선택된 콜이 없습니다."
                  : code;
        throw new Error(friendly);
      }

      // 성공한 ID만 로컬 state 즉시 반영 (target status로 갱신).
      // 중요: data.details.skipped (deleted/no_change 콜) 는 의도적으로 제외.
      //   - skipped 콜은 DB에서 상태가 안 바뀐 콜.
      //   - 만약 successIds가 아닌 모든 선택 ID를 업데이트하면 UI/DB mismatch 발생.
      //   - 따라서 successIds에만 status 적용 → router.refresh()로 보강 동기화.
      // completed_at 도 함께 null 로 (API와 동일하게 — target 이 항상 non-completed
      // 이므로 source가 completed 였더라도 완료 시각을 해제해 UI 일관성 보장).
      const successIds = new Set(data.details?.success ?? []);
      if (successIds.size > 0) {
        setCalls((prev) =>
          prev.map((c) =>
            successIds.has(c.id)
              ? { ...c, status: bulkStatusTarget, completed_at: null }
              : c,
          ),
        );
      }
      // 처리된 ID 선택 해제 (skipped/failed 포함).
      setSelectedIds(new Set());

      const s = data.success ?? 0;
      const k = data.skipped ?? 0;
      const f = data.failed ?? 0;
      let msg = `${s}건 상태변경`;
      if (k > 0) msg += ` · ${k}건 스킵`;
      if (f > 0) msg += ` · ${f}건 실패`;
      if (f > 0) toast.error(msg);
      else if (k > 0) toast.message(msg);
      else toast.success(msg);

      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 상태변경 실패");
    } finally {
      setBulkStatusing(false);
    }
  }

  async function handleUpdateLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("브라우저가 위치 정보를 지원하지 않습니다.");
      return;
    }
    toast.message("위치를 가져오는 중...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch("/api/profile/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          });
          if (res.ok) {
            toast.success("내 위치가 저장되었습니다.");
            setLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          } else {
            toast.error("위치 저장 실패");
          }
        } catch {
          toast.error("위치 저장 실패");
        }
      },
      (err) => {
        // GeolocationPositionError code 매핑:
        //   1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
        // 카카오/Android overlay 등 시스템 차단도 보통 1 또는 unspecified.
        // 자동 재시도 절대 금지 → 사용자가 다시 버튼 눌러야 새 요청 발생.
        let msg: string;
        switch (err?.code) {
          case 1:
            msg =
              "위치 권한이 거부되었습니다. 브라우저 주소창 또는 앱 설정에서 위치 허용 후 다시 눌러주세요.";
            break;
          case 2:
            msg = "위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.";
            break;
          case 3:
            msg = "위치 요청 시간 초과. 다시 시도해주세요.";
            break;
          default:
            msg =
              "위치 요청이 차단되었습니다. 다른 앱의 알림창/오버레이를 닫고 다시 시도하거나, 브라우저 대신 PWA 앱으로 접속해주세요.";
        }
        toast.error(msg);
        console.warn("[geolocation] error", err);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleCancel(callId: string) {
    setActionError(null);
    setActionLoadingId(callId);
    try {
      const res = await fetch("/api/calls/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId, status: "cancelled" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "취소에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setActionError("취소에 실패했습니다.");
    } finally {
      setActionLoadingId(null);
    }
  }

  const visible = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const regionTerm = region.trim().toLowerCase();

    return calls
      // soft delete 가드 #2 (client-side defensive filter):
      // page query에서 이미 제외되지만, realtime/state 손실 등에서 deleted row가
      // 일시적으로 섞일 가능성 차단. 휴지통은 별도 page라 영향 없음.
      .filter((call) => !call.deleted_at)
      .filter((call) => !HIDDEN_STATUSES.includes(call.status))
      .filter((call) => {
                if (selectedDate) {
          // 날짜 필터는 "고객 희망일" 기준.
          // preferred_time 우선, NULL이면 scheduled_date(방문 재조정일) fallback.
          // 둘 다 NULL이면 날짜 필터 활성화 시 제외.
          // preferred_time은 ISO timestamp이므로 사용자 로컬(한국) timezone 기준
          // YYYY-MM-DD로 변환 후 비교.
          let callDate: string | null = null;
          if (call.preferred_time) {
            const d = new Date(call.preferred_time);
            callDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          } else {
            const scheduledDate = (call as { scheduled_date?: string | null })
              .scheduled_date;
            callDate = scheduledDate ?? null;
          }
          if (callDate !== selectedDate) return false;
        }
        if (filterMine && call.assigned_to !== currentUserId) return false;
        if (filter === "new" && call.status !== "new") return false;
        if (filter === "mine" && call.assigned_to !== currentUserId) return false;
        if (filter === "completed" && call.status !== "completed") return false;
        if (filter === "cancelled" && call.status !== "cancelled") return false;
        if (showTechnicianFilter && technicianFilter !== "all") {
          if (technicianFilter === "unassigned") {
            if (call.assigned_to) return false;
          } else if (call.assigned_to !== technicianFilter) {
            return false;
          }
        }
        return true;
      })
      .filter((call) => {
        if (!searchTerm) return true;
        return [
          call.customer_name,
          call.phone,
          call.address,
          call.symptom,
          call.district ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm);
      })
      .filter((call) => {
        if (!regionTerm) return true;
        return (
          call.district?.toLowerCase().includes(regionTerm) ||
          call.address.toLowerCase().includes(regionTerm)
        );
      })
      .filter((call) => {
        if (radius === "all" || !location) return true;
        if (call.latitude == null || call.longitude == null) return false;
        return getDistanceKm(location.lat, location.lng, call.latitude, call.longitude) <= radius;
      })
      .sort((a, b) => {
        if (sortBy === "distance") {
          if (!location) return 0;
          const aDistance = a.latitude != null && a.longitude != null ? getDistanceKm(location.lat, location.lng, a.latitude, a.longitude) : Infinity;
          const bDistance = b.latitude != null && b.longitude != null ? getDistanceKm(location.lat, location.lng, b.latitude, b.longitude) : Infinity;
          return aDistance - bDistance;
        }
        if (sortBy === "amount") {
          return (b.estimated_amount ?? 0) - (a.estimated_amount ?? 0);
        }
        if (sortBy === "preferred_time") {
          const aTime = a.preferred_time ? new Date(a.preferred_time).getTime() : 0;
          const bTime = b.preferred_time ? new Date(b.preferred_time).getTime() : 0;
          return aTime - bTime;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [calls, currentUserId, filter, filterMine, location, radius, region, search, selectedDate, sortBy, technicianFilter, showTechnicianFilter]);

  const pagedCalls = useMemo(() => visible.slice(0, page * PAGE_SIZE), [visible, page]);

  // visible 변동 시 selectedIds 자동 prune.
  // 시나리오:
  //   - 필터/검색 변경으로 일부 콜이 숨겨지면 선택에서 자동 해제
  //   - 본인/타 admin이 단건 삭제로 콜이 제거되면 자동 해제
  //   - realtime UPDATE로 deleted_at 채워진 콜이 제거되면 자동 해제
  // → "안 보이는데 선택 상태 유지"로 인한 의도치 않은 bulk 삭제 방지.
  // immutable 규칙: next는 항상 new Set, prev(selectedIds)는 forEach 만 사용.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleIds = new Set(visible.map((c) => c.id));
    let changed = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedIds(next);
  }, [visible, selectedIds]);

  // 전체 선택은 visible(현재 필터 적용된 전체) 기준.
  // 정책 변경 (Phase 3+): 완료콜도 선택 가능.
  //   - bulk soft delete: API에서 완료콜 skip (정산 보호 정책 유지)
  //   - bulk status: API에서 완료콜 skip (un-complete 방지)
  //   → 즉 UI에서 체크는 허용하되 destructive 처리에서 자동 제외 (skipped 카운트로 안내).
  // deleted_at은 그대로 제외 (휴지통 콜은 visible에 없지만 race 시 방어).
  const selectableVisibleIds = useMemo(
    () => visible.filter((c) => !c.deleted_at).map((c) => c.id),
    [visible],
  );

  function selectAllVisible() {
    // 새 Set 생성 (selectableVisibleIds 배열 → Set 변환). 기존 prev 미터치.
    setSelectedIds(new Set(selectableVisibleIds));
  }
  const canLoadMore = visible.length > page * PAGE_SIZE;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4 lg:sticky lg:top-2 lg:z-10">
        {filterMine ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">내 콜</p>
                <p className="text-sm text-slate-500">현재 나에게 배정된 콜만 표시됩니다.</p>
              </div>
              <div className="flex items-center gap-2">
                {currentUserRole === "technician" && (
                  <button
                    type="button"
                    onClick={handleUpdateLocation}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    📍 내 위치 갱신
                  </button>
                )}
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                  {visible.length}건
                </span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 text-xs font-semibold text-slate-600">검색</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="고객명, 전화번호, 주소"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="block">
  <span className="mb-1 text-xs font-semibold text-slate-600">희망일 조회</span>
  <input
    type="date"
    value={selectedDate}
    onChange={(event) => setSelectedDate(event.target.value)}
    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
  />
</label>
              <label className="block">
                <span className="mb-1 text-xs font-semibold text-slate-600">정렬</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortKey)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  {sortOptions.map((option) => (
                    <option
                      key={option.key}
                      value={option.key}
                      disabled={filterMine && option.key === "distance" && !location}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : (
          // 일반 레이아웃: STATUS_FILTERS는 항상 노출, 그 외 필터는 accordion 안.
          // 모바일 세로 공간 절약 + 검색/희망일/지역/반경 input은 펼침 시 풀폭 가까이.
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={
                    filter === item.key
                      ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                  }
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFilterPanelOpen((v) => !v)}
                aria-expanded={filterPanelOpen}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {filterPanelOpen ? "상세 검색 접기" : "상세 검색 펼쳐보기"}
                <ChevronDown
                  size={14}
                  className={`transition-transform ${filterPanelOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            {/* grid-rows trick으로 height transition. 접힘 시 0fr → 펼침 시 1fr */}
            <div
              className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ${
                filterPanelOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-3 pt-1">
                  <div
                    className={
                      showTechnicianFilter
                        ? "grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
                        : "grid gap-2 sm:grid-cols-2 md:grid-cols-4"
                    }
                  >
                    <label className="block">
                      <span className="mb-1 text-xs font-semibold text-slate-600">검색</span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="고객명, 전화, 주소, 증상"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 text-xs font-semibold text-slate-600">희망일 조회</span>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 text-xs font-semibold text-slate-600">지역 검색</span>
                      <input
                        value={region}
                        onChange={(event) => setRegion(event.target.value)}
                        placeholder="구/동 입력"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </label>
                    {showTechnicianFilter && (
                      <label className="block">
                        <span className="mb-1 text-xs font-semibold text-slate-600">기사</span>
                        <select
                          value={technicianFilter}
                          onChange={(event) => setTechnicianFilter(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        >
                          <option value="all">전체 기사</option>
                          <option value="unassigned">미배정</option>
                          {technicianOptions.map((tech) => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1 text-xs font-semibold text-slate-600">정렬</span>
                      <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortKey)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      >
                        {sortOptions.map((option) => (
                          <option key={option.key} value={option.key} disabled={filterMine && option.key === "distance" && !location}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-600">반경 필터 (현재 위치 기반)</p>
                      {location ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">허용됨</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">권한 필요</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {RADIUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setRadius(option.value)}
                          disabled={!location && option.value !== "all"}
                          className={
                            radius === option.value
                              ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
                              : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {locationError && (
                      <p className="mt-2 text-xs text-rose-600">{locationError}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 삭제 권한 정책 (의도된 설계, future maintainer 주의):
            admin      : 이 액션바(bulk soft delete) + 카드 단건 삭제 모두 가능
            dispatcher : 카드 단건 삭제만 (액션바 안 보임). bulk는 영향 범위 ↑ 라 admin only.
            technician : 어떤 삭제도 불가 (UI/API/DB 3중 차단).
          이 가드를 변경하려면 /api/calls/bulk-delete 의 role 체크와 함께 수정 필요. */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm">
          <span className="font-semibold text-slate-700">
            선택 {selectedIds.size}건
            {selectedIds.size >= BULK_DELETE_MAX ? (
              <span className="ml-1 text-rose-600">(최대)</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={
              bulkDeleting || selectableVisibleIds.length === 0
            }
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="현재 필터에 보이는 미완료/미삭제 콜 전체 선택"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkDeleting || selectedIds.size === 0}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            선택 해제
          </button>
          {/* 일괄 상태변경:
                target select(대기/잡음/취소) + 변경 버튼.
                완료(completed) 는 의도적으로 제외 (단건 흐름 보호 — push/해피콜/정산 부수 효과).
                상세 사유는 /api/calls/bulk-status 헤더 주석 참고. */}
          <div className="flex items-center gap-1">
            <select
              value={bulkStatusTarget}
              onChange={(e) =>
                setBulkStatusTarget(
                  e.target.value as "new" | "assigned" | "cancelled",
                )
              }
              disabled={bulkStatusing || bulkDeleting}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
              aria-label="변경할 상태"
            >
              {/* DB enum 값은 그대로 (new/assigned/cancelled). UI 라벨만 운영자 친화. */}
              <option value="new">대기</option>
              <option value="assigned">배정됨</option>
              <option value="cancelled">취소</option>
            </select>
            <button
              type="button"
              onClick={handleBulkStatus}
              disabled={
                bulkStatusing || bulkDeleting || selectedIds.size === 0
              }
              className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkStatusing
                ? "변경 중..."
                : `선택 상태변경 (${selectedIds.size})`}
            </button>
          </div>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting || bulkStatusing || selectedIds.size === 0}
            className="ml-auto rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkDeleting ? "삭제 중..." : `선택 삭제 (${selectedIds.size})`}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          {emptyText ?? "표시할 콜이 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[1.7fr_1.3fr_1fr_1fr_0.8fr_0.9fr] gap-2 px-3 text-xs uppercase tracking-[0.16em] text-slate-500 sm:grid">
            <div>지역 / 주소</div>
            <div>증상</div>
            <div>희망시간</div>
            <div>견적금액</div>
            <div>상태</div>
            <div className="text-right">동작</div>
          </div>
          {pagedCalls.map((call) => {
            const assignee = call.assigned_to ? profileMap.get(call.assigned_to) : null;
            const isMine = call.assigned_to === currentUserId;
            const distance =
              location && call.latitude != null && call.longitude != null
                ? getDistanceKm(location.lat, location.lng, call.latitude, call.longitude)
                : null;
            // 완료콜도 체크 가능 (bulk delete/status는 API에서 자동 skip).
            // deleted_at 콜은 정상 흐름엔 없지만 race 방어로 disable.
            const checkable = isAdmin && !call.deleted_at;
            return (
              <div
                key={call.id}
                // admin: 좌측 체크박스 + 우측 details (gap-2).
                // 비admin: 단일 자식이라 시각적으로 기존과 동일 (flex-1 details가 100%).
                className="flex items-start gap-2"
              >
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(call.id)}
                    onChange={() => toggleSelected(call.id)}
                    disabled={!checkable || bulkDeleting}
                    title={
                      !checkable
                        ? "삭제된 콜은 선택 불가"
                        : call.status === "completed"
                          ? "완료콜 (삭제는 제외되지만 상태변경은 가능합니다)"
                          : "선택"
                    }
                    aria-label="콜 선택"
                    className="mt-3 h-5 w-5 flex-none cursor-pointer accent-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                )}
              <details
  // 완료콜은 faded 회색 톤 (시각적으로 "끝남" 표시).
  // 신규콜은 white + emerald 강조. 그 외 white.
  className={`group min-w-0 flex-1 overflow-hidden rounded-xl border shadow-sm transition active:scale-[0.995] sm:rounded-2xl lg:rounded-[28px] ${
    call.status === "completed"
      ? "border-slate-200 bg-slate-100/70 text-slate-500 opacity-80"
      : call.status === "new"
        ? "border-emerald-300 bg-white shadow-emerald-50"
        : "border-slate-200 bg-white"
  }`}
>
                <summary className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-[12px] text-slate-700 transition sm:grid-cols-[1.7fr_1.3fr_1fr_1fr_0.8fr_0.9fr] sm:items-center sm:gap-2 sm:px-3 sm:py-2.5 sm:text-[13px] lg:py-1.5">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-bold text-slate-900 sm:text-sm">
                        {call.district ?? "지역 미정"}
                      </span>
                      <span className="truncate text-[11px] text-slate-500 sm:hidden">
                        {call.address}
                      </span>
                    </p>
                    <p className="hidden truncate text-xs text-slate-500 sm:block">
                      {call.address}
                    </p>
                    {distance != null && (
                      <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">{distance.toFixed(1)}km</p>
                    )}
                  </div>
                  <div className="col-span-2 min-w-0 text-[11px] text-slate-600 sm:col-span-1 sm:text-[13px]">
                    <p className="truncate">{call.symptom ?? "증상 없음"}</p>
                  </div>
                  <div className="text-[11px] sm:text-[13px]">{formatPreferredTime(call.preferred_time)}</div>
                  <div className="text-[11px] font-medium sm:text-[13px]">
                    {(() => {
                      // 완료 콜은 기사가 입력한 실제 결제금액(paid_amount) 우선,
                      // 미입력 시 예상금액(estimated_amount) fallback.
                      // 그 외 상태는 예상금액 그대로.
                      const display =
                        call.status === "completed"
                          ? (call.paid_amount ?? call.estimated_amount)
                          : call.estimated_amount;
                      return display != null ? formatKRW(display) : "-";
                    })()}
                  </div>
               <div>
  <div className="flex flex-wrap items-center gap-1">
    <StatusBadge status={call.status} />
    {assignee && (
      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
        {assignee.name}
      </span>
    )}
  </div>

{(currentUserRole === "admin" || currentUserRole === "dispatcher") &&
  call.paid_amount != null &&
  call.customer_amount != null &&
  Number(call.paid_amount) > 0 &&
  Number(call.customer_amount) > 0 &&
  Number(call.paid_amount) !== Number(call.customer_amount) && (
    <div className="mt-1 rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
      금액 불일치
    </div>
)}

{(currentUserRole === "admin" || currentUserRole === "dispatcher") &&
  call.status === "completed" &&
  !call.happy_call_checked && (
    <div className="mt-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
      해피콜 미완료
    </div>
)}
</div>
                  <div className="flex flex-col items-end gap-2">
                    {currentUserRole === "technician" && call.status === "new" && !call.assigned_to ? (
                      // technician + 미배정 신규콜: 잡기 + 상세 둘 다 (상세 페이지 진입 없이 바로 선점 가능)
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            claimCall(call.id);
                          }}
                          disabled={claimingCallId === call.id}
                          className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60 hover:bg-brand-700"
                        >
                          {claimingCallId === call.id ? "잡는 중..." : "잡기"}
                        </button>
                        <Link
                          href={`/calls/${call.id}`}
                          className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          상세
                        </Link>
                      </div>
                    ) : isMine && call.status === "assigned" ? (
                      <Link
                        href={`/calls/${call.id}`}
                        className="inline-flex rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
                      >
                        상세 / 정산
                      </Link>
                    ) : (
                      <Link
                        href={`/calls/${call.id}`}
                        className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        상세
                      </Link>
                    )}
                    {isMine && call.status === "assigned" && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            handleRelease(call.id);
                          }}
                          disabled={actionLoadingId === call.id}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          반납
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            handleCancel(call.id);
                          }}
                          disabled={actionLoadingId === call.id}
                          className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                </summary>
                <div className="border-t border-slate-200 px-4 pb-4 pt-3 text-sm text-slate-600">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">전화</p>
                      <p>{call.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">메모</p>
                      <p>{call.memo ?? "없음"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">담당자</p>
                      <p>{assignee ? assignee.name : "미배정"}</p>
                    </div>
                  </div>
                  {/* 단건 soft delete 버튼.
                      권한: admin + dispatcher 모두 허용 (운영 정책상 dispatcher의 단건 삭제 유지).
                      technician 는 여기 자체에 도달 못 함 (조건문에서 제외).
                      bulk 삭제는 위 액션바(admin only)에서 별도 처리.
                      변경 시 /api/calls/delete 의 role 체크와 일관성 유지 필요. */}
                  {(currentUserRole === "admin" ||
                    currentUserRole === "dispatcher") &&
                    call.status !== "completed" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            handleDelete(call.id, call.customer_name);
                          }}
                          disabled={deleteLoadingId === call.id}
                          className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {deleteLoadingId === call.id ? "삭제중..." : "🗑 삭제"}
                        </button>
                      </div>
                    )}
                  {actionError && actionLoadingId === call.id && (
                    <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{actionError}</p>
                  )}
                </div>
              </details>
              </div>
            );
          })}
          {canLoadMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                더보기 ({Math.min((page + 1) * PAGE_SIZE, visible.length)} / {visible.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
