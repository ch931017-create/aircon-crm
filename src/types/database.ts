// 수동 작성. 추후 `supabase gen types typescript --project-id ... > src/types/database.ts` 로 재생성 가능.
//
// 참고: 각 Row/Insert/Update 타입에 `[key: string]: unknown` 인덱스 시그니처를 추가한 이유는
// supabase-js의 `GenericTable` 제약 (`Row: Record<string, unknown>` 등)을 만족시키기 위함입니다.
// 자동 생성된 타입과 동등하지만 인덱스 시그니처가 명시되어 있을 뿐입니다.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "dispatcher" | "technician";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type PaymentMethod =
  | "cash"
  | "transfer"
  | "card"
  | "cash_receipt"
  | "tax_invoice";
export type PaymentStatus = "unpaid" | "paid";
export type SettlementStatus = "pending" | "settled";

export type CallStatus =
  | "new"
  | "assigned"
  | "on_the_way"
  | "working"
  | "scheduled"
  | "visiting"
  | "completed"
  | "cancelled";

export interface ProfileRow {
  id: string;
  name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  cash_ratio: number;
  invoice_ratio: number;
  card_ratio: number;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  [key: string]: unknown;
}

export interface CallRow {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  district: string | null;
  symptom: string | null;
  preferred_time: string | null;
  memo: string | null;
  estimated_amount: number | null;
  technician_amount: number | null;
  customer_amount: number | null;
  amount_mismatch_checked: boolean | null;
  happy_call_checked: boolean | null;
  happy_call_memo: string | null;
  happy_call_checked_at: string | null;
  happy_call_token: string | null;
  happy_call_sent_at: string | null;
  customer_confirmed_at: string | null;
  paid_amount: number | null;
  payment_method: PaymentMethod | null;
  tax_included: boolean;
  invoice_business_id: string | null;
  invoice_business_name: string | null;
  invoice_ceo_name: string | null;
  invoice_email: string | null;
  settlement_note: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: CallStatus;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  assigned_technician_id: string | null;
  settlement_status: SettlementStatus;
  settled_at: string | null;
  settled_by: string | null;
  payment_status: PaymentStatus;
  paid_at: string | null;
  tax_invoice_issued: boolean;
  tax_invoice_issued_at: string | null;
  tax_invoice_issued_by: string | null;
  tax_invoice_memo: string | null;
  tax_invoice_file_url: string | null;
  [key: string]: unknown;
}

interface ProfileInsert {
  id: string;
  name?: string;
  phone?: string | null;
  role?: UserRole;
  is_active?: boolean;
  created_at?: string;
  approval_status?: ApprovalStatus;
  approved_at?: string | null;
  approved_by?: string | null;
  [key: string]: unknown;
}

interface ProfileUpdate {
  id?: string;
  name?: string;
  phone?: string | null;
  role?: UserRole;
  is_active?: boolean;
  created_at?: string;
  approval_status?: ApprovalStatus;
  approved_at?: string | null;
  approved_by?: string | null;
  [key: string]: unknown;
}

interface CallInsert {
  id?: string;
  customer_name: string;
  phone: string;
  address: string;
  district?: string | null;
  symptom?: string | null;
  preferred_time?: string | null;
  memo?: string | null;
  estimated_amount?: number | null;
  technician_amount?: number | null;
  customer_amount?: number | null;
  amount_mismatch_checked?: boolean | null;
  happy_call_checked?: boolean | null;
  happy_call_memo?: string | null;
  happy_call_checked_at?: string | null;
  happy_call_token?: string | null;
  happy_call_sent_at?: string | null;
  customer_confirmed_at?: string | null;
  paid_amount?: number | null;
  payment_method?: PaymentMethod | null;
  tax_included?: boolean;
  invoice_business_id?: string | null;
  invoice_business_name?: string | null;
  invoice_ceo_name?: string | null;
  invoice_email?: string | null;
  settlement_note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: CallStatus;
  assigned_to?: string | null;
  assigned_technician_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  assigned_at?: string | null;
  completed_at?: string | null;
  settlement_status?: SettlementStatus;
  settled_at?: string | null;
  settled_by?: string | null;
  payment_status?: PaymentStatus;
  paid_at?: string | null;
  tax_invoice_issued?: boolean;
  tax_invoice_issued_at?: string | null;
  tax_invoice_issued_by?: string | null;
  tax_invoice_memo?: string | null;
  tax_invoice_file_url?: string | null;
  [key: string]: unknown;
}

interface CallUpdate {
  id?: string;
  customer_name?: string;
  phone?: string;
  address?: string;
  district?: string | null;
  symptom?: string | null;
  preferred_time?: string | null;
  memo?: string | null;
  estimated_amount?: number | null;
  technician_amount?: number | null;
  customer_amount?: number | null;
  amount_mismatch_checked?: boolean | null;
  happy_call_checked?: boolean | null;
  happy_call_memo?: string | null;
  happy_call_checked_at?: string | null;
  happy_call_token?: string | null;
  happy_call_sent_at?: string | null;
  customer_confirmed_at?: string | null;
  paid_amount?: number | null;
  payment_method?: PaymentMethod | null;
  tax_included?: boolean;
  invoice_business_id?: string | null;
  invoice_business_name?: string | null;
  invoice_ceo_name?: string | null;
  invoice_email?: string | null;
  settlement_note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: CallStatus;
  assigned_to?: string | null;
  assigned_technician_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  assigned_at?: string | null;
  completed_at?: string | null;
  settlement_status?: SettlementStatus;
  settled_at?: string | null;
  settled_by?: string | null;
  payment_status?: PaymentStatus;
  paid_at?: string | null;
  tax_invoice_issued?: boolean;
  tax_invoice_issued_at?: string | null;
  tax_invoice_issued_by?: string | null;
  tax_invoice_memo?: string | null;
  tax_invoice_file_url?: string | null;
  [key: string]: unknown;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      calls: {
        Row: CallRow;
        Insert: CallInsert;
        Update: CallUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      call_status: CallStatus;
      settlement_status: SettlementStatus;
      payment_status: PaymentStatus;
      payment_method: PaymentMethod;
      approval_status: ApprovalStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
