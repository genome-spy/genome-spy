import { describe, expect, test } from "vitest";

import { createTestViewContext } from "./testUtils.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import {
    getViewScopeChain,
    resolveParamSelector,
    resolveViewSelector,
} from "./viewSelectors.js";

/**
 * @param {string} name
 * @returns {import("../spec/view.js").UnitSpec}
 */
const makeUnitSpec = (name) => ({
    name,
    data: {
        values: [
            {
                x: 1,
                y: 2,
            },
        ],
    },
    mark: "point",
    encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
    },
});

/**
 * @returns {import("../spec/view.js").ViewSpec}
 */
const makeTemplate = () => ({
    vconcat: [makeUnitSpec("coverage")],
});

describe("view selectors", () => {
    test("resolveViewSelector separates named import scopes", async () => {
        const context = createTestViewContext();

        const spec = {
            templates: {
                panel: makeTemplate(),
            },
            vconcat: [
                {
                    import: { template: "panel" },
                    name: "panelA",
                },
                {
                    import: { template: "panel" },
                    name: "panelB",
                },
            ],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const viewA = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "coverage",
        });
        const viewB = resolveViewSelector(root, {
            scope: ["panelB"],
            view: "coverage",
        });

        expect(viewA).toBeDefined();
        expect(viewB).toBeDefined();
        expect(viewA).not.toBe(viewB);
        expect(getViewScopeChain(viewA)).toEqual(["panelA"]);
        expect(getViewScopeChain(viewB)).toEqual(["panelB"]);

        const importRoot = resolveViewSelector(root, {
            scope: [],
            view: "panelA",
        });
        expect(importRoot).toBeDefined();
    });

    test("unnamed import scopes do not appear in selector chains", async () => {
        const context = createTestViewContext();

        const spec = {
            templates: {
                panel: makeTemplate(),
            },
            vconcat: [
                {
                    import: { template: "panel" },
                },
            ],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const view = resolveViewSelector(root, {
            scope: [],
            view: "coverage",
        });

        expect(view).toBeDefined();
        expect(getViewScopeChain(view)).toEqual([]);
    });

    test("resolveParamSelector respects import scopes", async () => {
        const context = createTestViewContext();

        const rangeBind =
            /** @type {import("../spec/parameter.js").BindRange} */ ({
                input: "range",
            });

        const spec = {
            params: [
                {
                    name: "threshold",
                    value: 0,
                    bind: rangeBind,
                },
            ],
            templates: {
                panel: {
                    params: [
                        {
                            name: "threshold",
                            value: 1,
                            bind: rangeBind,
                        },
                    ],
                    vconcat: [makeUnitSpec("coverage")],
                },
            },
            vconcat: [
                {
                    import: { template: "panel" },
                    name: "panelA",
                },
            ],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const rootParam = resolveParamSelector(root, {
            scope: [],
            param: "threshold",
        });
        const panelParam = resolveParamSelector(root, {
            scope: ["panelA"],
            param: "threshold",
        });

        expect(rootParam).toBeDefined();
        expect(panelParam).toBeDefined();
        expect(rootParam.view).toBe(root);
        expect(rootParam.view).not.toBe(panelParam.view);
    });
});
