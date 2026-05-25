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
  // 들어오면 client state도 동기화. realtime이 동작하지 않거나 늦는 경우
  // router.refresh() 후 즉시 반영되도록 보장.
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

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("calls-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls" },
        (payload) => {
          const row = payload.new as CallRow;
          setCalls((prev) => {
            if (prev.some((c) => c.id === row.id)) return prev;
            return [row, ...prev];
          });

          if (row.status === "new" && !notifiedCallIds.current.has(row.id)) {
            notifiedCallIds.current.add(row.id);
            toast.success(`새 콜 등록: ${row.district ?? "지역 미정"} ${row.address}`);
            if (soundEnabled) playNotificationSound();
            if (notificationEnabled && notificationPermission === "granted") {
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
  }, [notificationEnabled, notificationPermission, soundEnabled]);

  useEffect(() => {
    if (!navigator?.geolocation) {
      setLocationError("브라우저가 위치 정보를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        setLocationError("위치 권한이 필요합니다. 지역 검색을 이용해주세요.");
        console.warn("Geolocation error", error);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

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
      // 로컬 상태에서 즉시 제거 (RLS 변경 후 다음 fetch에선 자동으로 안 보임)
      setCalls((prev) => prev.filter((c) => c.id !== callId));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleteLoadingId(null);
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
      () => toast.error("위치 권한이 필요합니다."),
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
                필터 설정
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
            return (
              <details
  key={call.id}
  // 완료콜은 faded 회색 톤 (시각적으로 "끝남" 표시).
  // 신규콜은 white + emerald 강조. 그 외 white.
  className={`group overflow-hidden rounded-xl border shadow-sm transition active:scale-[0.995] sm:rounded-2xl lg:rounded-[28px] ${
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
                  <div className="text-[11px] font-medium sm:text-[13px]">{call.estimated_amount != null ? formatKRW(call.estimated_amount) : "-"}</div>
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
