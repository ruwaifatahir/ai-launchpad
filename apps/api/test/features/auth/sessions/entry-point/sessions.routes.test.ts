import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The domain is mocked and schema.ts is left real, so validation is exercised
// through the wire rather than around it. The session middleware is never mocked:
// its rejection paths are the point of this feature.
vi.mock("@/features/auth/sessions/domain/nonce", () => ({ issueNonce: vi.fn() }));
vi.mock("@/features/auth/sessions/domain/verification", () => ({ openSession: vi.fn() }));

import app from "@/app";
import { ApiError } from "@/shared";
import { mintCredential } from "@/lib/credential";
import { issueNonce } from "@/features/auth/sessions/domain/nonce";
import { openSession } from "@/features/auth/sessions/domain/verification";
import { forgeCredential } from "@test/helpers/credential";

const wallet = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";
const signature = `0x${"ab".repeat(65)}`;

describe("GET /api/v1/auth/sessions/nonce", () => {
  beforeEach(() => {
    vi.mocked(issueNonce).mockResolvedValue({ nonce: "thenonce" });
  });

  it("answers 200 with the nonce in the shared envelope", async () => {
    const res = await request(app).get("/api/v1/auth/sessions/nonce");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ nonce: "thenonce" });
  });

  it("needs no credential, because a caller has no session until it has signed a nonce", async () => {
    const res = await request(app).get("/api/v1/auth/sessions/nonce");

    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/auth/sessions", () => {
  beforeEach(() => {
    vi.mocked(openSession).mockResolvedValue({ token: "a.credential.here" });
  });

  it("answers 201 with the credential, because a session is a thing the call created", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .send({ message: "localhost:5173 wants you to sign in", signature });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ token: "a.credential.here" });
  });

  it("hands the domain the parsed body, so the domain never sees a raw request", async () => {
    await request(app)
      .post("/api/v1/auth/sessions")
      .send({ message: "localhost:5173 wants you to sign in", signature });

    expect(openSession).toHaveBeenCalledWith({
      message: "localhost:5173 wants you to sign in",
      signature,
    });
  });

  it("answers 400 for a missing message and never calls the domain, which is the point of parsing at the edge", async () => {
    const res = await request(app).post("/api/v1/auth/sessions").send({ signature });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Validation error");
    expect(openSession).not.toHaveBeenCalled();
  });

  it("answers 400 for a signature that is not hex, so a malformed body never reaches verification", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .send({ message: "hello", signature: "not-a-signature" });

    expect(res.status).toBe(400);
    expect(openSession).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown field, because the schema is strict", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .send({ message: "hello", signature, wallet });

    expect(res.status).toBe(400);
    expect(openSession).not.toHaveBeenCalled();
  });

  it("carries a domain rejection through as its own 401, so the controller holds no rule of its own", async () => {
    vi.mocked(openSession).mockRejectedValue(
      ApiError.unauthorized("Could not verify that signed message."),
    );

    const res = await request(app)
      .post("/api/v1/auth/sessions")
      .send({ message: "hello", signature });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Could not verify that signed message.");
  });
});

describe("GET /api/v1/auth/sessions/current", () => {
  it("answers 200 with the wallet a real credential names, proving the session middleware runs unmocked", async () => {
    const res = await request(app)
      .get("/api/v1/auth/sessions/current")
      .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ wallet });
  });

  it("returns the wallet and no other field, because that is the whole of what a session holds", async () => {
    const res = await request(app)
      .get("/api/v1/auth/sessions/current")
      .set("Authorization", `Bearer ${await mintCredential(wallet)}`);

    expect(Object.keys(res.body.data)).toEqual(["wallet"]);
  });

  it("answers 401 with no Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/sessions/current");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("answers 401 for a credential altered after it was issued", async () => {
    const token = await mintCredential(wallet);
    const tampered = `${token.slice(0, -4)}beef`;

    const res = await request(app)
      .get("/api/v1/auth/sessions/current")
      .set("Authorization", `Bearer ${tampered}`);

    expect(res.status).toBe(401);
  });

  it("answers 401 for a credential issued more than seven days ago", async () => {
    const res = await request(app)
      .get("/api/v1/auth/sessions/current")
      .set(
        "Authorization",
        `Bearer ${await forgeCredential(wallet, { expiresIn: "-1s" })}`,
      );

    expect(res.status).toBe(401);
  });

  it("reads no session from a cookie, so a credential parked there is not a session", async () => {
    const res = await request(app)
      .get("/api/v1/auth/sessions/current")
      .set("Cookie", `token=${await mintCredential(wallet)}`);

    expect(res.status).toBe(401);
  });
});
