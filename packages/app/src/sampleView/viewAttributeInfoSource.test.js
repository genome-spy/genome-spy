// @ts-check
import { describe, expect, it, vi } from "vitest";
import ViewParamRuntime from "@genome-spy/core/paramRuntime/viewParamRuntime.js";
import { VISIT_SKIP, VISIT_STOP } from "@genome-spy/core/view/view.js";
import { registerImportInstance } from "@genome-spy/core/view/viewSelectors.js";

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
    const view =
        /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
            /** @type {any} */ ({
                explicitName: "track",
                name: "track",
                dataParent: undefined,
                paramRuntime: new ViewParamRuntime(),
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
                getDataAncestors() {
                    /** @type {any[]} */
                    const ancestors = [];
                    /** @type {any} */
                    let current = this;
                    while (current) {
                        ancestors.push(current);
                        current = current.dataParent;
                    }
                    return ancestors;
                },
            })
        );
    return view;
}

/**
 * @param {any[]} children
 * @returns {import("@genome-spy/core/view/containerView.js").default}
 */
function createRootStub(children) {
    return /** @type {import("@genome-spy/core/view/containerView.js").default} */ (
        /** @type {any} */ ({
            paramRuntime: new ViewParamRuntime(),
            visit(visitor) {
                const rootResult = visitor(this);
                if (rootResult === VISIT_STOP) {
                    return VISIT_STOP;
                }
                if (rootResult === VISIT_SKIP) {
                    return;
                }

                for (const child of children) {
                    const result = visitor(child);
                    if (result === VISIT_STOP) {
                        return VISIT_STOP;
                    }
                }
            },
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

    it("prefixes ambiguous imported view and selection names with scope", () => {
        const panelA = createViewStub();
        panelA.paramRuntime.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });
        registerImportInstance(panelA, "panelA");

        const panelB = createViewStub();
        panelB.paramRuntime.registerParam({
            name: "brush",
            select: { type: "interval", encodings: ["x"] },
        });
        registerImportInstance(panelB, "panelB");

        const root = createRootStub([panelA, panelB]);
        panelA.dataParent = root;
        panelB.dataParent = root;

        resolveViewRefMock.mockReturnValue(panelA);

        const info = getViewAttributeInfo(root, {
            type: "VALUE_AT_LOCUS",
            specifier: {
                view: {
                    scope: ["panelA"],
                    view: "track",
                },
                field: "value",
                aggregation: { op: "count" },
                interval: {
                    type: "selection",
                    selector: { scope: ["panelA"], param: "brush" },
                },
            },
        });

        const title = templateResultToString(info.title);
        expect(title).toContain("(panelA/Track)");
        expect(title).toContain("selection panelA/brush");
    });
});
