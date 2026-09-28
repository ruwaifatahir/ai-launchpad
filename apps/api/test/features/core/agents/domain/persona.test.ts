import { describe, expect, it } from "vitest";
import { hasCompletePersona } from "@/features/core/agents/domain/persona";

const complete = {
  name: "Ada",
  personality: "curious",
  lore: "born on chain",
  style: "dry",
};

describe("hasCompletePersona", () => {
  it("counts a persona with all four parts as written", () => {
    expect(hasCompletePersona(complete)).toBe(true);
  });

  it.each(["name", "personality", "lore", "style"] as const)(
    "counts a persona missing its %s as unwritten, because any one part missing publishes nothing",
    (part) => {
      expect(hasCompletePersona({ ...complete, [part]: null })).toBe(false);
    },
  );

  it("counts a token with no agent row as unwritten, because a row is created by the first write", () => {
    expect(hasCompletePersona(null)).toBe(false);
    expect(hasCompletePersona(undefined)).toBe(false);
  });
});
