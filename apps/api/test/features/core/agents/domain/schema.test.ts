import { describe, expect, it } from "vitest";

import {
  agentParamsSchema,
  reviseAgentSchema,
  setAgentPauseSchema,
} from "@/features/core/agents/domain/schema";

const checksummed = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";

const parseToken = (token: unknown) => agentParamsSchema.safeParse({ params: { token } });

const parseChange = (body: unknown) =>
  reviseAgentSchema.safeParse({ params: { token: checksummed }, body });

const parsePause = (body: unknown) =>
  setAgentPauseSchema.safeParse({ params: { token: checksummed }, body });

describe("agentParamsSchema", () => {
  it("lowercases the token, so the key an agent is stored under never depends on how a creator copied the address", () => {
    const result = parseToken(checksummed);

    expect(result.success).toBe(true);
    expect(result.data?.params.token).toBe(checksummed.toLowerCase());
  });

  it("accepts an address a creator sent in lowercase, which is the other form an explorer hands them", () => {
    const result = parseToken(checksummed.toLowerCase());

    expect(result.success).toBe(true);
    expect(result.data?.params.token).toBe(checksummed.toLowerCase());
  });

  it("rejects a path parameter that is not an address, so the domain is never handed a bare string", () => {
    expect(parseToken("not-an-address").success).toBe(false);
  });

  it("rejects a mistyped address, because it reads the one address rule rather than lowercasing the evidence away first", () => {
    expect(parseToken("0xA0Cf798816D4b9b9866b5330EEa46a18382f251f").success).toBe(false);
  });

  it("rejects an address of the wrong length, which a truncated copy and paste produces", () => {
    expect(parseToken(checksummed.slice(0, -2)).success).toBe(false);
  });
});

describe("reviseAgentSchema", () => {
  it("accepts a body carrying one persona part on its own, so a creator writes the persona over several sittings", () => {
    const result = parseChange({ lore: "Born in a warehouse" });

    expect(result.success).toBe(true);
    expect(result.data?.body).toEqual({ lore: "Born in a warehouse" });
  });

  it("accepts a null persona part, because a creator deleting lore they regret is clearing it rather than replacing it", () => {
    const result = parseChange({ lore: null });

    expect(result.success).toBe(true);
    expect(result.data?.body).toEqual({ lore: null });
  });

  it("trims a persona part before it is stored, so leading and trailing space never reaches the column", () => {
    expect(parseChange({ name: "  Vector  " }).data?.body).toEqual({ name: "Vector" });
  });

  it("rejects a whitespace only persona part rather than storing it as an empty string, because a stray space is not a written character", () => {
    expect(parseChange({ personality: "   " }).success).toBe(false);
  });

  it("holds the name to 40 characters, the tightest of the four because it is an identity rather than content", () => {
    expect(parseChange({ name: "a".repeat(40) }).success).toBe(true);
    expect(parseChange({ name: "a".repeat(41) }).success).toBe(false);
  });

  it("holds the personality to 1000 characters, so the four parts together stay inside a model's prompt budget", () => {
    expect(parseChange({ personality: "a".repeat(1000) }).success).toBe(true);
    expect(parseChange({ personality: "a".repeat(1001) }).success).toBe(false);
  });

  it("holds the lore to 2000 characters, the most of the four because backstory is what creators write at length", () => {
    expect(parseChange({ lore: "a".repeat(2000) }).success).toBe(true);
    expect(parseChange({ lore: "a".repeat(2001) }).success).toBe(false);
  });

  it("holds the style to 500 characters, the least of the four because it is instruction rather than content", () => {
    expect(parseChange({ style: "a".repeat(500) }).success).toBe(true);
    expect(parseChange({ style: "a".repeat(501) }).success).toBe(false);
  });

  it("names the field that broke its cap, so a creator is told which part to trim rather than that the whole request was bad", () => {
    const result = parseChange({ style: "a".repeat(501) });

    expect(result.error?.issues[0]?.path).toEqual(["body", "style"]);
  });

  it("measures a cap against the trimmed text, so surrounding space never costs a creator characters they could have written", () => {
    const padded = " ".concat("a".repeat(40), " ");

    expect(parseChange({ name: padded }).success).toBe(true);
  });

  it("accepts the whole topics list at once, because topics are set rather than appended to one at a time", () => {
    const result = parseChange({ topics: ["the curve", "the stock"] });

    expect(result.success).toBe(true);
    expect(result.data?.body).toEqual({ topics: ["the curve", "the stock"] });
  });

  it("accepts an empty topics list, so a creator can start the topics over rather than only replace them", () => {
    expect(parseChange({ topics: [] }).data?.body).toEqual({ topics: [] });
  });

  it("holds the topics to ten entries, so the list stays a steer on what the agent talks about rather than a script", () => {
    const topic = (index: number) => "topic ".concat(String(index));

    expect(
      parseChange({ topics: Array.from({ length: 10 }, (_v, i) => topic(i)) }).success,
    ).toBe(true);
    expect(
      parseChange({ topics: Array.from({ length: 11 }, (_v, i) => topic(i)) }).success,
    ).toBe(false);
  });

  it("holds each topic to 60 characters, so ten of them cost the prompt no more than one persona part", () => {
    expect(parseChange({ topics: ["a".repeat(60)] }).success).toBe(true);
    expect(parseChange({ topics: ["a".repeat(61)] }).success).toBe(false);
  });

  it("trims a topic and rejects a whitespace only one, which is the same rule the persona parts hold", () => {
    expect(parseChange({ topics: ["  the curve  "] }).data?.body).toEqual({
      topics: ["the curve"],
    });
    expect(parseChange({ topics: ["   "] }).success).toBe(false);
  });

  it("rejects a null topics list, because emptying the topics is an empty list rather than an absent one", () => {
    expect(parseChange({ topics: null }).success).toBe(false);
  });

  it("accepts a pace inside one to five, which is the band that keeps an account from being flagged for volume", () => {
    expect(parseChange({ pace: 1 }).data?.body).toEqual({ pace: 1 });
    expect(parseChange({ pace: 5 }).data?.body).toEqual({ pace: 5 });
  });

  it("rejects a pace outside one to five, so a creator cannot set a volume that gets the account flagged", () => {
    expect(parseChange({ pace: 0 }).success).toBe(false);
    expect(parseChange({ pace: 6 }).success).toBe(false);
  });

  it("rejects a fractional pace, because posts a day is counted rather than measured", () => {
    expect(parseChange({ pace: 2.5 }).success).toBe(false);
  });

  it("rejects a pace that is not a number, so a string or a boolean never lands in the column as a count", () => {
    expect(parseChange({ pace: "3" }).success).toBe(false);
    expect(parseChange({ pace: true }).success).toBe(false);
  });

  it("rejects an unknown field rather than dropping it, so a typo in a field name fails loudly instead of losing the write", () => {
    expect(parseChange({ name: "Vector", nmae: "Vector" }).success).toBe(false);
  });

  it("rejects a field only an admin or a later spec sets, so a creator cannot stop or pause their agent through this route", () => {
    expect(parseChange({ pace: 2, stoppedAt: null }).success).toBe(false);
    expect(parseChange({ pace: 2, pausedAt: null }).success).toBe(false);
  });

  it("rejects a body that changes nothing, so an empty edit is never mistaken for a successful one", () => {
    expect(parseChange({}).success).toBe(false);
  });
});

describe("setAgentPauseSchema", () => {
  it("takes the pause as a boolean, so one route both silences the agent and starts it again", () => {
    expect(parsePause({ paused: true }).data?.body).toEqual({ paused: true });
    expect(parsePause({ paused: false }).data?.body).toEqual({ paused: false });
  });

  it("requires the pause, because a body that never says which state it wants is not a request to set one", () => {
    expect(parsePause({}).success).toBe(false);
  });

  it("rejects a pause that is not a boolean, so a string a panel sent by mistake never reads as a pause", () => {
    expect(parsePause({ paused: "true" }).success).toBe(false);
    expect(parsePause({ paused: 1 }).success).toBe(false);
    expect(parsePause({ paused: null }).success).toBe(false);
  });

  it("rejects an unknown field rather than dropping it, so a typo in a field name fails loudly instead of losing the write", () => {
    expect(parsePause({ paused: true, pasued: true }).success).toBe(false);
  });

  it("rejects a persona part sent alongside the pause, because pausing is not an edit and the two routes stay apart", () => {
    expect(parsePause({ paused: true, name: "Vector" }).success).toBe(false);
  });

  it("rejects the admin stop, so a creator can never clear a stop through the route they pause with", () => {
    expect(parsePause({ paused: false, stoppedAt: null }).success).toBe(false);
  });

  it("lowercases the token the same way every other agent route does, so a pause lands on the row the read shows", () => {
    expect(parsePause({ paused: true }).data?.params.token).toBe(
      checksummed.toLowerCase(),
    );
  });
});
