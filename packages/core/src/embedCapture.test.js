import { expect, it, vi } from "vitest";
import { attachCaptureTarget } from "./embedCapture.js";

it("connects an independently loaded module to the original embed", async () => {
    const api = /** @type {import("./types/embedApi.js").EmbedResult} */ ({});
    const target = /** @type {any} */ ({ canvas: "original canvas" });
    attachCaptureTarget(api, () => target);
    // Independent bundles each evaluate their own copy of this module.
    vi.resetModules();
    const { getCaptureTarget } = await import("./embedCapture.js");
    expect(getCaptureTarget(api)).toBe(target);
    expect(Object.keys(api)).toEqual([]);
});

it("rejects an embed without the compatible capture contract", async () => {
    const { getCaptureTarget } = await import("./embedCapture.js");
    expect(() => getCaptureTarget(/** @type {any} */ ({}))).toThrow(
        "same release"
    );
});
