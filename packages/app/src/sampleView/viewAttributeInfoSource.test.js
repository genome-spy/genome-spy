// @ts-check
import { describe, expect, it, vi } from "vitest";

vi.mock("./viewRef.js", () => ({
    resolveViewRef: vi.fn(),
}));

vi.mock("./attributeAggregation/attributeAccessors.js", () => ({
    createViewAttributeAccessor: vi.fn(() => () => undefined),
}));

vi.mock("./attributeValues.js", () => ({
    createDefaultValuesProvider: vi.fn(() => () => []),
}));

vi.mock("./attributeAggregation/intervalFormatting.js", () => ({
    formatInterval: vi.fn(() => "chr1:1-2"),
}));

import getViewAttributeInfo from "./viewAttributeInfoSource.js";
import { resolveViewRef } from "./viewRef.js";
import templateResultToString from "../utils/templateResultToString.js";

const resolveViewRefMock = /** @type {any} */ (resolveViewRef);

/**
 * @returns {import("@genome-spy/core/view/unitView.js").default}
 */
function createViewStub() {
    return /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
        /** @type {any} */ ({
            name: "track",
            getTitleText: () => "Track",
            getEncoding: () => ({
                x: { field: "x", type: "quantitative" },
                y: { field: "value", type: "quantitative" },
            }),
            getScaleResolution: () => ({
                getScale: () => ({ type: "linear" }),
            }),
            getCollector: () => ({ facetBatches: new Map() }),
            getDataAccessor: () => () => undefined,
        })
    );
}

describe("getViewAttributeInfo", () => {
    it("shows selection source labels using the param name", () => {
        const view = createViewStub();
        resolveViewRefMock.mockReturnValue(view);

        const info = getViewAttributeInfo(/** @type {any} */ ({}), {
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: "track",
                field: "value",
                aggregation: { op: "count" },
                interval: {
                    type: "selection",
                    selector: { scope: [], param: "brush" },
                },
            },
        });

        const title = templateResultToString(info.title);
        expect(title).toContain("selection brush");
    });

    it("shows literal interval labels using formatted coordinates", () => {
        const view = createViewStub();
        resolveViewRefMock.mockReturnValue(view);

        const info = getViewAttributeInfo(/** @type {any} */ ({}), {
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: "track",
                field: "value",
                aggregation: { op: "count" },
                interval: [1, 2],
            },
        });

        const title = templateResultToString(info.title);
        expect(title).toContain("chr1:1-2");
    });
});
