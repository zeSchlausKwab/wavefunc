import { z } from "zod";
import { PublicKeySchema } from "./user";

// Example DVM that processes text
export const DVMRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text-process"),
    input: z.string(),
    options: z
      .object({
        uppercase: z.boolean().optional(),
        reverse: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("music_recognition"),
    audioUrl: z.string().url(),
    requestId: z.string().optional(),
  }),
]);

export const DVMResponseSchema = z.object({
  input: z.string(),
  output: z.string(),
  processedAt: z.number(),
});

export type DVMRequest = z.infer<typeof DVMRequestSchema>;
export type DVMResponse = z.infer<typeof DVMResponseSchema>;
