import { describe, expect, test } from "vitest";

import { createTestViewContext } from "./testUtils.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import {
    getViewScopeChain,
    resolveParamSelector,
    resolveViewSelector,
    validateSelectorConstraints,
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

/**
 * @param {string} name
 * @param {import("../spec/parameter.js").Parameter[]} params
 * @returns {import("../spec/view.js").UnitSpec}
 */
const makeUnitSpecWithParams = (name, params) => ({
    ...makeUnitSpec(name),
    params,
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

    test("resolveViewSelector handles nested import scopes", async () => {
        const context = createTestViewContext();

        const spec = {
            templates: {
                inner: makeTemplate(),
                outer: {
                    vconcat: [
                        {
                            import: { template: "inner" },
                            name: "innerA",
                        },
                        {
                            import: { template: "inner" },
                            name: "innerB",
                        },
                    ],
                },
            },
            vconcat: [
                {
                    import: { template: "outer" },
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

        const viewA = resolveViewSelector(root, {
            scope: ["panelA", "innerA"],
            view: "coverage",
        });
        const viewB = resolveViewSelector(root, {
            scope: ["panelA", "innerB"],
            view: "coverage",
        });

        expect(viewA).toBeDefined();
        expect(viewB).toBeDefined();
        expect(viewA).not.toBe(viewB);
        expect(getViewScopeChain(viewA)).toEqual(["panelA", "innerA"]);
        expect(getViewScopeChain(viewB)).toEqual(["panelA", "innerB"]);

        expect(
            resolveViewSelector(root, { scope: ["panelA"], view: "coverage" })
        ).toBeUndefined();

        const innerRoot = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "innerA",
        });
        expect(innerRoot).toBeDefined();
        expect(getViewScopeChain(innerRoot)).toEqual(["panelA", "innerA"]);
    });

    test("validateSelectorConstraints reports duplicate configurable view names", async () => {
        const context = createTestViewContext();

        const spec = {
            vconcat: [makeUnitSpec("coverage"), makeUnitSpec("coverage")],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) => issue.message.includes("coverage"))
        ).toBeTruthy();
    });

    test("validateSelectorConstraints ignores duplicates across named scopes", async () => {
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

        const issues = validateSelectorConstraints(root);
        expect(issues.length).toBe(0);
    });

    test("validateSelectorConstraints flags duplicate view names in root scope", async () => {
        const context = createTestViewContext();

        // Two unnamed imports with addressable content must be named.
        const spec = {
            templates: {
                panel: makeTemplate(),
            },
            vconcat: [
                {
                    import: { template: "panel" },
                },
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

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) => issue.message.includes("coverage"))
        ).toBeTruthy();
    });

    test("validateSelectorConstraints allows unnamed imports with unique names", async () => {
        const context = createTestViewContext();

        const spec = {
            templates: {
                panelA: {
                    vconcat: [makeUnitSpec("coverageA")],
                },
                panelB: {
                    vconcat: [makeUnitSpec("coverageB")],
                },
            },
            vconcat: [
                {
                    import: { template: "panelA" },
                },
                {
                    import: { template: "panelB" },
                },
            ],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const issues = validateSelectorConstraints(root);
        expect(issues.length).toBe(0);
    });

    test("validateSelectorConstraints flags duplicate bookmarkable params", async () => {
        const context = createTestViewContext();

        const rangeBind =
            /** @type {import("../spec/parameter.js").BindRange} */ ({
                input: "range",
            });

        const spec = {
            vconcat: [
                makeUnitSpecWithParams("coverage", [
                    {
                        name: "threshold",
                        value: 0,
                        bind: rangeBind,
                    },
                ]),
                makeUnitSpecWithParams("coverageB", [
                    {
                        name: "threshold",
                        value: 1,
                        bind: rangeBind,
                    },
                ]),
            ],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) => issue.message.includes("threshold"))
        ).toBeTruthy();
    });
});
