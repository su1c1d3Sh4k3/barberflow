import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const serviceSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  description: z.string().optional(),
  duration_min: z.number().min(5, "Mínimo 5 minutos").max(480, "Máximo 8 horas"),
  price: z.number().min(0, "Preço deve ser positivo"),
  category_id: z.string().uuid("Categoria inválida").optional().nullable(),
});

export const contactSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().min(10, "Telefone inválido"),
  birthday: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});

export const appointmentSchema = z.object({
  contact_id: z.string().uuid("Cliente é obrigatório").optional(),
  professional_id: z.string().uuid("Profissional é obrigatório"),
  service_id: z.string().uuid().optional(),
  service_ids: z.array(z.string().uuid()).optional(),
  start_at: z.string().min(1, "Data/hora é obrigatória"),
  company_id: z.string().uuid().optional(),
  client_name: z.string().optional(),
  client_phone: z.string().optional(),
  coupon_code: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});

export type CategoryFormData = z.infer<typeof categorySchema>;
export type ServiceFormData = z.infer<typeof serviceSchema>;
export type ContactFormData = z.infer<typeof contactSchema>;
export type AppointmentFormData = z.infer<typeof appointmentSchema>;
