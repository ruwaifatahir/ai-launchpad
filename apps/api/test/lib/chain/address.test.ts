import { describe, expect, it } from "vitest";

import { chainAddress } from "@/lib/chain/address";

const checksummed = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const mistyped = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251f";

const parse = (value: unknown) => chainAddress.safeParse(value);

describe("chainAddress", () => {
  it("rejects a mistyped address whose capitals no longer match, which is the only typo an address carries the evidence to catch", () => {
    expect(parse(mistyped).success).toBe(false);
  });

  it("checks the capitals before lowercasing, because lowercasing first destroys the evidence the check reads", () => {
    expect(parse(mistyped.toLowerCase()).success).toBe(true);
    expect(parse(mistyped).success).toBe(false);
  });

  it("returns the address lowercased, so one token is one key however a creator copied it", () => {
    expect(parse(checksummed).data).toBe(checksummed.toLowerCase());
    expect(parse(checksummed.toLowerCase()).data).toBe(checksummed.toLowerCase());
  });

  it("accepts an address a creator sent in lowercase, which is the other form an explorer hands them", () => {
    expect(parse(checksummed.toLowerCase()).success).toBe(true);
  });

  it("rejects a casing no explorer produces, so a hand edited address is never guessed at", () => {
    expect(parse(checksummed.toUpperCase().replace("0X", "0x")).success).toBe(false);
  });

  it("rejects a string that is not an address, so no caller is ever handed a bare string typed as one", () => {
    expect(parse("not-an-address").success).toBe(false);
  });

  it("rejects an address of the wrong length, which a truncated copy and paste produces", () => {
    expect(parse(checksummed.slice(0, -2)).success).toBe(false);
  });

  it("rejects a value that is not a string, so a repeated query parameter never reaches viem", () => {
    expect(parse(["0x1111111111111111111111111111111111111111"]).success).toBe(false);
    expect(parse(undefined).success).toBe(false);
  });
});
