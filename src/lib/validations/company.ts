import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(2, "Nome da empresa é obrigatório"),
  description: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.object({
    cep: z.string().optional(),
    rua: z.string().optional(),
    numero: z.string().optional(),
    bairro: z.string().optional(),
    cidade: z.string().optional(),
    estado: z.string().optional(),
  }).optional(),
});

export const businessHoursSchema = z.object({
  weekday: z.number().min(0).max(6),
  open_time: z.string(),
  close_time: z.string(),
  break_start: z.string().optional(),
  break_end: z.string().optional(),
  closed: z.boolean(),
});

export type CompanyFormData = z.infer<typeof companySchema>;
export type BusinessHoursFormData = z.infer<typeof businessHoursSchema>;
