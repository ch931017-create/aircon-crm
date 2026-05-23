/**
 * Seed script — 테스트 계정 3개 + 더미 콜 5건 생성
 *
 * 실행:  node scripts/seed.mjs
 * 필요:  .env.local 에 SUPABASE_SERVICE_ROLE_KEY 설정
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// .env.local 직접 파싱 ----------------------------------
const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local 파일이 없습니다.");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    email: "admin@test.com",
    password: "test1234",
    name: "관리자",
    role: "admin",
    phone: "010-0000-0001",
  },
  {
    email: "dispatcher@test.com",
    password: "test1234",
    name: "콜직원",
    role: "dispatcher",
    phone: "010-0000-0002",
  },
  {
    email: "tech1@test.com",
    password: "test1234",
    name: "김기사",
    role: "technician",
    phone: "010-0000-0003",
  },
];

async function ensureUser(u) {
  // 이미 있으면 재사용
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let existing = list?.users?.find((x) => x.email === u.email);
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name, phone: u.phone },
    });
    if (error) throw error;
    existing = data.user;
    console.log(`  + 생성: ${u.email}`);
  } else {
    console.log(`  · 이미 존재: ${u.email}`);
  }

  // profile upsert (role/name/phone 보장)
  const { error: pErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: existing.id,
        name: u.name,
        phone: u.phone,
        role: u.role,
        is_active: true,
      },
      { onConflict: "id" },
    );
  if (pErr) throw pErr;
  return existing.id;
}

async function seedCalls(dispatcherId) {
  const { count } = await admin
    .from("calls")
    .select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.log(`  · calls 테이블에 이미 ${count}건 — 시드 건너뜀`);
    return;
  }

  const now = new Date();
  const hr = (h) => new Date(now.getTime() + h * 3600_000).toISOString();

  const rows = [
    {
      customer_name: "박영희",
      phone: "010-1111-2222",
      address: "서울시 강남구 역삼동 123-4",
      district: "강남구",
      symptom: "냉방이 안 됨",
      preferred_time: hr(2),
      memo: "오후 2시 이후 가능",
      estimated_amount: 80000,
      status: "new",
      created_by: dispatcherId,
    },
    {
      customer_name: "김민수",
      phone: "010-3333-4444",
      address: "서울시 서초구 서초동 55",
      district: "서초구",
      symptom: "물이 새는 중",
      preferred_time: hr(4),
      memo: null,
      estimated_amount: 60000,
      status: "new",
      created_by: dispatcherId,
    },
    {
      customer_name: "이지영",
      phone: "010-5555-6666",
      address: "서울시 송파구 잠실동 200",
      district: "송파구",
      symptom: "실외기 소음 심함",
      preferred_time: hr(6),
      memo: "벨 누르지 마세요",
      estimated_amount: 100000,
      status: "new",
      created_by: dispatcherId,
    },
    {
      customer_name: "최준호",
      phone: "010-7777-8888",
      address: "서울시 마포구 합정동 88",
      district: "마포구",
      symptom: "리모컨 작동 안 됨",
      preferred_time: hr(8),
      memo: null,
      estimated_amount: 40000,
      status: "new",
      created_by: dispatcherId,
    },
    {
      customer_name: "정수빈",
      phone: "010-9999-0000",
      address: "서울시 용산구 한남동 12",
      district: "용산구",
      symptom: "냄새가 심함, 청소 의뢰",
      preferred_time: hr(24),
      memo: "내일 오전 선호",
      estimated_amount: 120000,
      status: "new",
      created_by: dispatcherId,
    },
  ];

  const { error } = await admin.from("calls").insert(rows);
  if (error) throw error;
  console.log(`  + 더미 콜 ${rows.length}건 생성`);
}

async function main() {
  console.log("→ 사용자 시드");
  const ids = {};
  for (const u of USERS) {
    ids[u.role] = await ensureUser(u);
  }

  console.log("→ 콜 시드");
  await seedCalls(ids.dispatcher);

  console.log("\n✅ 시드 완료. 로그인 정보:");
  for (const u of USERS) {
    console.log(`   ${u.role.padEnd(10)} : ${u.email}  /  ${u.password}`);
  }
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
