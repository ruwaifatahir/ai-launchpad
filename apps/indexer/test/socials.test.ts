import { describe, expect, it } from "vitest";

import { socialsFrom } from "../src/socials";

describe("socialsFrom", () => {
  it("maps the token's socials() tuple to its five links, in order", () => {
    expect(
      socialsFrom([
        "https://x.com/hello",
        "https://t.me/hello",
        "https://discord.gg/hello",
        "https://hello.xyz",
        "https://farcaster.xyz/hello",
      ]),
    ).toEqual({
      twitter: "https://x.com/hello",
      telegram: "https://t.me/hello",
      discord: "https://discord.gg/hello",
      website: "https://hello.xyz",
      farcaster: "https://farcaster.xyz/hello",
    });
  });

  // HELLO's real socials on testnet: only Twitter and Telegram set.
  it("stores a link the creator left unset as null", () => {
    expect(
      socialsFrom(["https://x.com/dsafds", "https://t.me/dsfds", "", "", ""]),
    ).toEqual({
      twitter: "https://x.com/dsafds",
      telegram: "https://t.me/dsfds",
      discord: null,
      website: null,
      farcaster: null,
    });
  });
});
