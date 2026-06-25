import { describe, expect, test } from "vitest";
import { getViewIdentityRegistry } from "./viewIdentityRegistry.js";

describe("getViewIdentityRegistry", () => {
    test("returns stable per-root view ids", () => {
        const rootA = /** @type {any} */ ({});
        const rootB = /** @type {any} */ ({});
        const child = /** @type {any} */ ({});

        const registryA = getViewIdentityRegistry(rootA);
        const registryB = getViewIdentityRegistry(rootB);

        expect(getViewIdentityRegistry(rootA)).toBe(registryA);
        expect(registryA.getId(rootA)).toBe("view-0");
        expect(registryA.getId(child)).toBe("view-1");
        expect(registryA.getId(child)).toBe("view-1");
        expect(registryA.getView("view-1")).toBe(child);

        expect(registryB.getId(rootB)).toBe("view-0");
    });
});
