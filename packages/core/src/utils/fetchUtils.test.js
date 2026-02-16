import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./fetchUtils.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchJson", () => {
    it("returns parsed JSON", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ ok: true }),
            }))
        );

        await expect(
            fetchJson("https://example.org/data.json")
        ).resolves.toEqual({ ok: true });
    });

    it("throws on non-ok responses", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
            }))
        );

        await expect(
            fetchJson("https://example.org/missing.json")
        ).rejects.toThrow("HTTP 404 Not Found");
    });

    it("throws when JSON parsing fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => {
                    throw new SyntaxError("Unexpected token");
                },
            }))
        );

        await expect(fetchJson("https://example.org/bad.json")).rejects.toThrow(
            "Invalid JSON:"
        );
    });

    it("throws on network failures", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("Network down");
            })
        );

        await expect(
            fetchJson("https://example.org/offline.json")
        ).rejects.toThrow("Network error:");
    });
});
