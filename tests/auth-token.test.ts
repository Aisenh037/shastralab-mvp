import { beforeAll, describe, expect, it } from "vitest";
import { issueToken, verifyToken } from "../lib/auth-token";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-vitest";
});

describe("HMAC session tokens", () => {
  it("round-trips a valid token", () => {
    const token = issueToken("user_123");
    expect(verifyToken(token)).toBe("user_123");
  });

  it("rejects a tampered signature", () => {
    const token = issueToken("user_123");
    expect(verifyToken(token.slice(0, -2) + "xx")).toBeNull();
  });

  it("rejects a swapped user id", () => {
    const token = issueToken("user_123");
    expect(verifyToken("user_456" + token.slice(8))).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = issueToken("user_123");
    const past31Days = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(verifyToken(token, past31Days)).toBeNull();
  });

  it("rejects missing or malformed tokens", () => {
    expect(verifyToken(undefined)).toBeNull();
    expect(verifyToken("not.a.token.at.all")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});
