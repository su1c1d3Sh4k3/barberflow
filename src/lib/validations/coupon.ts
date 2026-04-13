import { z } from "zod";

export const couponSchema = z.object({
  code: z.string().min(3).max(30).optional(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().min(0.01),
  max_uses: z.number().int().positive().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

export type CouponFormData = z.infer<typeof couponSchema>;
