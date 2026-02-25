// @ts-check
import { describe, expect, it } from "vitest";
import { tryResolvePointExpandOriginDatum } from "./selectionExpansionOrigin.js";

describe("selectionExpansionOrigin", () => {
    it("resolves key fields from encoding.key", () => {
        /** @type {any} */
        const view = {
            getEncoding: () => ({
                key: [{ field: "sample" }, { field: "id" }],
            }),
            getCollector: () => ({
                completed: true,
                findDatumByKey: (fields, tuple) => ({
                    sample: tuple[0],
                    id: tuple[1],
                    fields,
                }),
            }),
        };

        const result = tryResolvePointExpandOriginDatum(view, {
            view: { scope: [], view: "variants" },
            keyTuple: ["S1", "A"],
        });

        expect(result).toEqual({
            reason: "ok",
            keyFields: ["sample", "id"],
            datum: {
                sample: "S1",
                id: "A",
                fields: ["sample", "id"],
            },
        });
    });

    it("returns mismatch for legacy keyFields that differ from encoding.key", () => {
        /** @type {any} */
        const view = {
            getEncoding: () => ({
                key: [{ field: "sample" }, { field: "id" }],
            }),
            getCollector: () => ({
                completed: true,
                findDatumByKey: () => undefined,
            }),
        };

        const result = tryResolvePointExpandOriginDatum(view, {
            keyFields: ["id", "sample"],
            view: { scope: [], view: "variants" },
            keyTuple: ["S1", "A"],
        });

        expect(result).toEqual({
            reason: "legacyKeyFieldsMismatch",
            keyFields: ["sample", "id"],
            legacyKeyFields: ["id", "sample"],
        });
    });

    it("returns failed datum resolution when collector throws", () => {
        const result = tryResolvePointExpandOriginDatum(
            /** @type {any} */ ({
                getEncoding: () => ({ key: [{ field: "id" }] }),
                getCollector: () => ({
                    completed: true,
                    findDatumByKey: () => {
                        throw new Error("boom");
                    },
                }),
            }),
            {
                view: { scope: [], view: "variants" },
                keyTuple: ["A"],
            }
        );

        expect(result.reason).toBe("lookupError");
        if (result.reason === "lookupError") {
            expect(String(result.error)).toContain("boom");
        }
    });

    it("returns missingCollector when origin view has no collector", () => {
        const result = tryResolvePointExpandOriginDatum(
            /** @type {any} */ ({
                getEncoding: () => ({ key: [{ field: "id" }] }),
            }),
            {
                view: { scope: [], view: "variants" },
                keyTuple: ["A"],
            }
        );

        expect(result).toEqual({ reason: "missingCollector" });
    });
});
