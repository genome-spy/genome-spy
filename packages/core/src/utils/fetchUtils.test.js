import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpStatusError, JsonParseError } from "./fetchUtils.js";

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

    it("throws HttpStatusError for non-ok responses", async () => {
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
        ).rejects.toBeInstanceOf(HttpStatusError);
    });

    it("throws JsonParseError when JSON parsing fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => {
                    throw new SyntaxError("Unexpected token");
                },
            }))
        );

        await expect(
            fetchJson("https://example.org/bad.json")
        ).rejects.toBeInstanceOf(JsonParseError);
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
        ).rejects.toThrow("Network down");
    });
});
