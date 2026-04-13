import { z } from "zod";

export const messageLogSchema = z.object({
  contact_id: z.string().uuid("ID do contato inválido"),
  direction: z.enum(["inbound", "outbound"], {
    error: "Direção deve ser 'inbound' ou 'outbound'",
  }),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  sent_by: z.enum(["system", "ia", "human"]).optional(),
});

export type MessageLogData = z.infer<typeof messageLogSchema>;
