import { describe, expect, it } from "vitest";

import { postJobSchema } from "@/features/core/posts/domain/schema";

const token = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
const lowercased = "0xbcd4042de499d14e55001ccbb24a551f3b954096";

describe("postJobSchema", () => {
  it("lowercases the token, so the job names the same key the agents table is keyed by", () => {
    expect(postJobSchema.parse({ token }).token).toBe(lowercased);
  });

  it("rejects a token that is not an address, so a malformed job fails at the boundary rather than halfway through a post", () => {
    expect(postJobSchema.safeParse({ token: "nope" }).success).toBe(false);
  });

  it("rejects a job naming no token, because there is no agent to publish for", () => {
    expect(postJobSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an unknown field rather than dropping it, because a job carrying one was not enqueued by this tick", () => {
    expect(postJobSchema.safeParse({ token, text: "written elsewhere" }).success).toBe(
      false,
    );
  });
});
