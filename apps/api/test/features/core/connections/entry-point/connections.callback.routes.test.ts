import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The domain is mocked and schema.ts is left real, so validation is exercised
// through the wire rather than around it. Nothing else is mocked, because nothing
// else stands between X and this route: it is the only route in the codebase
// authenticated by neither a credential nor a key.
vi.mock("@/features/core/connections/domain/linking", () => ({
  linkAccount: vi.fn(),
}));

import app from "@/app";
import { logger } from "@/lib/logger";
import { linkAccount } from "@/features/core/connections/domain/linking";

const state = "aStateTheAppIssued";
const code = "theCodeXSentBack";
const token = "0xa0cf798816d4b9b9866b5330eea46a18382f251e";
const other = "0xbcd4042de499d14e55001ccbb24a551f3b954096";

const path = "/api/v1/core/connections/callback";

const returnFromX = (query: string) => request(app).get(`${path}?${query}`);

const location = (header: string) => new URL(header);

const landedOn = (res: { headers: Record<string, string> }) =>
  Object.fromEntries(location(res.headers.location).searchParams);

describe("GET /api/v1/core/connections/callback", () => {
  beforeEach(() => {
    vi.mocked(linkAccount).mockResolvedValue({ connected: true, token });
  });

  it("sends the creator back to the panel rather than answering with a body, because X returns a browser and a person has to land somewhere they can use", async () => {
    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.status).toBe(302);
    expect(location(res.headers.location).origin).toBe("http://localhost:5173");
  });

  it("builds the return target from the first configured panel origin, so the target and the CORS allowlist cannot drift apart", async () => {
    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.headers.location.startsWith("http://localhost:5173/")).toBe(true);
  });

  it("carries the outcome and the token it names, so the panel shows the right agent and the right message without guessing", async () => {
    const connected = await returnFromX(`state=${state}&code=${code}`);

    expect(landedOn(connected)).toEqual({ status: "success", token });

    vi.mocked(linkAccount).mockResolvedValue({
      connected: false,
      reason: "declined",
      token,
    });

    const declined = await returnFromX(`state=${state}&error=access_denied`);

    expect(landedOn(declined)).toEqual({ status: "failure", reason: "declined", token });
  });

  it("sends an X account already serving another token back as taken, naming the creator's own token, so they land on their agent and learn to use a different account", async () => {
    vi.mocked(linkAccount).mockResolvedValue({
      connected: false,
      reason: "taken",
      token,
    });

    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.status).toBe(302);
    expect(landedOn(res)).toEqual({ status: "failure", reason: "taken", token });
  });

  it("sends a state AI Launchpad is not holding back as expired and names no token, so a forged or replayed return points the panel nowhere", async () => {
    vi.mocked(linkAccount).mockResolvedValue({ connected: false, reason: "expired" });

    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.status).toBe(302);
    expect(landedOn(res)).toEqual({ status: "failure", reason: "expired" });
  });

  it("sends a failure the domain did not see coming back as an error, and logs it, so an outage before the handshake is read still lands the creator on a page", async () => {
    vi.mocked(linkAccount).mockRejectedValue(new Error("Redis could not be reached."));

    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.status).toBe(302);
    expect(landedOn(res)).toEqual({ status: "failure", reason: "error" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("carries no state, no code and no handle in the return target, so nothing worth having sits in a creator's browser history", async () => {
    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.headers.location).not.toContain(state);
    expect(res.headers.location).not.toContain(code);
  });

  it("hands the domain the state and the code and nothing else, so a token named in the request never reaches it and the stored handshake stays the only source of one", async () => {
    await returnFromX(`state=${state}&code=${code}&token=${other}`);

    expect(linkAccount).toHaveBeenCalledWith({ state, code });
  });

  it("needs no credential, because X returns the creator as a browser navigation and a navigation carries none", async () => {
    const res = await returnFromX(`state=${state}&code=${code}`);

    expect(res.status).toBe(302);
    expect(linkAccount).toHaveBeenCalled();
  });

  it("sends a return carrying no state back as an error, and never calls the domain, because the state is the only thing vouching for this request", async () => {
    const res = await returnFromX(`code=${code}`);

    expect(res.status).toBe(302);
    expect(landedOn(res)).toEqual({ status: "failure", reason: "error" });
    expect(linkAccount).not.toHaveBeenCalled();
  });

  it("sends a return carrying neither a code nor an error back as an error, because X sends one or the other and anything else was not sent by X", async () => {
    const res = await returnFromX(`state=${state}`);

    expect(res.status).toBe(302);
    expect(landedOn(res)).toEqual({ status: "failure", reason: "error" });
    expect(linkAccount).not.toHaveBeenCalled();
  });

  it("sends a return whose error is longer than X ever sends back as an error, and never calls the domain, so an oversized value is refused before anything logs it", async () => {
    const res = await returnFromX(`state=${state}&error=${"x".repeat(257)}`);

    expect(res.status).toBe(302);
    expect(landedOn(res)).toEqual({ status: "failure", reason: "error" });
    expect(linkAccount).not.toHaveBeenCalled();
  });

  it("offers no way to write through the callback path with a verb X never uses: a post reaches nothing at all, and a delete falls through to the connection routes, which ask for a session before they read a word of the path", async () => {
    expect((await request(app).post(path)).status).toBe(404);
    expect((await request(app).delete(path)).status).toBe(401);
    expect(linkAccount).not.toHaveBeenCalled();
  });
});
