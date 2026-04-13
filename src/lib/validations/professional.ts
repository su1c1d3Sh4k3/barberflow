import { z } from "zod";

export const professionalSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  bio: z.string().optional(),
  commission_pct: z.number().min(0).max(100).optional().default(0),
  company_id: z.string().uuid().optional(),
  service_ids: z.array(z.string()).optional(),
  schedule: z.array(z.object({
    weekday: z.number().min(0).max(6),
    start_time: z.string(),
    end_time: z.string(),
    break_start: z.string().optional(),
    break_end: z.string().optional(),
  })).optional(),
});

export type ProfessionalFormData = z.infer<typeof professionalSchema>;
