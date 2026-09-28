import { z } from "zod";
import { chainAddress } from "@/lib/chain/address";

const NAME_MAX = 40;
const PERSONALITY_MAX = 1000;
const LORE_MAX = 2000;
const STYLE_MAX = 500;
const TOPICS_MAX = 10;
const TOPIC_LENGTH_MAX = 60;
const PACE_MIN = 1;
const PACE_MAX = 5;

const token = chainAddress;

const name = z.string().trim().min(1).max(NAME_MAX);
const personality = z.string().trim().min(1).max(PERSONALITY_MAX);
const lore = z.string().trim().min(1).max(LORE_MAX);
const style = z.string().trim().min(1).max(STYLE_MAX);
const topics = z.array(z.string().trim().min(1).max(TOPIC_LENGTH_MAX)).max(TOPICS_MAX);
const pace = z.number().int().min(PACE_MIN).max(PACE_MAX);

export const agentParamsSchema = z.object({
  params: z.object({ token }),
});

export const reviseAgentSchema = z.object({
  params: agentParamsSchema.shape.params,
  body: z
    .strictObject({
      name: name.nullable().optional(),
      personality: personality.nullable().optional(),
      lore: lore.nullable().optional(),
      style: style.nullable().optional(),
      topics: topics.optional(),
      pace: pace.optional(),
    })
    .refine(
      (body) => Object.keys(body).length > 0,
      "supply at least one field to change",
    ),
});

export const setAgentPauseSchema = z.object({
  params: agentParamsSchema.shape.params,
  body: z.strictObject({ paused: z.boolean() }),
});

export type AgentParams = z.infer<typeof agentParamsSchema>["params"];
export type ReviseAgentInput = z.infer<typeof reviseAgentSchema>["body"];
export type SetAgentPauseInput = z.infer<typeof setAgentPauseSchema>["body"];
