import { z } from "zod";

export const createCallSchema = z.object({
  customer_name: z.string().min(1, "고객명을 입력하세요"),
  phone: z.string().min(1, "전화번호를 입력하세요"),
  address: z.string().min(1, "주소를 입력하세요"),
  district: z.string().optional().nullable(),
  symptom: z.string().optional().nullable(),
  preferred_time: z.string().optional().nullable(), // datetime-local 문자열
  memo: z.string().optional().nullable(),
  estimated_amount: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v === "" || v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    }),
});

export type CreateCallInput = z.input<typeof createCallSchema>;
export type CreateCallParsed = z.output<typeof createCallSchema>;
