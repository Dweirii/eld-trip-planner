import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTrip } from "./server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchTrip (server)", () => {
  it("fetches the trip from Django without caching", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTrip("abc")).resolves.toEqual({ id: "abc" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/trips/abc/");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("returns null for an unknown trip", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    await expect(fetchTrip("nope")).resolves.toBeNull();
  });
});
