import { describe, expect, it } from "vitest";
import { rateLimited } from "../lib/ratelimit";

const req = (ip: string) => new Request("http://test.local", { headers: { "x-forwarded-for": ip } });

describe("auth rate limiter", () => {
  it("allows the first 10 attempts in a window, then blocks", () => {
    for (let i = 0; i < 10; i++) {
      expect(rateLimited(req("1.2.3.4"), "test-a")).toBe(false);
    }
    expect(rateLimited(req("1.2.3.4"), "test-a")).toBe(true);
  });

  it("tracks buckets independently per IP", () => {
    for (let i = 0; i < 11; i++) rateLimited(req("5.6.7.8"), "test-b");
    expect(rateLimited(req("9.9.9.9"), "test-b")).toBe(false);
  });

  it("tracks buckets independently per endpoint", () => {
    for (let i = 0; i < 11; i++) rateLimited(req("7.7.7.7"), "test-c");
    expect(rateLimited(req("7.7.7.7"), "test-d")).toBe(false);
  });
});
