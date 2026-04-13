import { z } from "zod";

export const iaSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  tone: z.enum(["formal", "humorado", "educado", "simpatico"], {
    error: "Tom deve ser: formal, humorado, educado ou simpatico",
  }).optional(),
  instructions: z.string().max(2000).optional(),
  knowledge_base_url: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
  test_mode: z.boolean().optional(),
  test_numbers: z.array(z.string()).optional(),
  handoff_keywords: z.array(z.string()).optional(),
});

export type IASettingsData = z.infer<typeof iaSettingsSchema>;
