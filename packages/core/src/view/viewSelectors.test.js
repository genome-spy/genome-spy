import { describe, expect, test } from "vitest";

import { createTestViewContext } from "./testUtils.js";
import { VIEW_ROOT_NAME } from "./viewFactory.js";
import {
    getBookmarkableParams,
    getParamSelector,
    getViewScopeChain,
    makeParamSelectorKey,
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

    test("visitBookmarkableParams yields scoped selectors", async () => {
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

        const entries = getBookmarkableParams(root);
        const selectors = entries.map((entry) => entry.selector);

        expect(selectors).toEqual(
            expect.arrayContaining([
                getParamSelector(root, "threshold"),
                { scope: ["panelA"], param: "threshold" },
            ])
        );
    });

    test("makeParamSelectorKey is stable", () => {
        const selector = { scope: ["panelA"], param: "threshold" };
        const key = makeParamSelectorKey(selector);

        expect(key).toBe(
            "p:" +
                JSON.stringify({
                    scope: ["panelA"],
                    param: "threshold",
                })
        );
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

    test("resolveViewSelector resolves lifted views by data import scope", async () => {
        const context = createTestViewContext();

        const spec = {
            templates: {
                panel: {
                    vconcat: [makeUnitSpec("track")],
                },
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

        const panelATrack = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "track",
        });
        const panelBTrack = resolveViewSelector(root, {
            scope: ["panelB"],
            view: "track",
        });
        const rootContainer =
            /** @type {import("./containerView.js").default} */ (root);

        const summaryA = await context.createOrImportView(
            makeUnitSpec("summary"),
            rootContainer,
            panelATrack,
            "summaryView"
        );
        const summaryB = await context.createOrImportView(
            makeUnitSpec("summary"),
            rootContainer,
            panelBTrack,
            "summaryView"
        );

        // Lifted summaries live under root in layout but inherit data scopes
        // from imported tracks.
        /** @type {import("./concatView.js").default} */ (root).appendChildView(
            summaryA
        );
        /** @type {import("./concatView.js").default} */ (root).appendChildView(
            summaryB
        );

        const resolvedA = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "summary",
        });
        const resolvedB = resolveViewSelector(root, {
            scope: ["panelB"],
            view: "summary",
        });

        expect(resolvedA).toBe(summaryA);
        expect(resolvedB).toBe(summaryB);
    });

    test("resolveParamSelector resolves lifted params by data import scope", async () => {
        const context = createTestViewContext();

        const rangeBind =
            /** @type {import("../spec/parameter.js").BindRange} */ ({
                input: "range",
            });

        const spec = {
            templates: {
                panel: {
                    vconcat: [makeUnitSpec("track")],
                },
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

        const panelATrack = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "track",
        });
        const panelBTrack = resolveViewSelector(root, {
            scope: ["panelB"],
            view: "track",
        });
        const rootContainer =
            /** @type {import("./containerView.js").default} */ (root);

        const summarySpec = makeUnitSpecWithParams("summary", [
            {
                name: "threshold",
                value: 0,
                bind: rangeBind,
            },
        ]);

        const summaryA = await context.createOrImportView(
            structuredClone(summarySpec),
            rootContainer,
            panelATrack,
            "summaryView"
        );
        const summaryB = await context.createOrImportView(
            structuredClone(summarySpec),
            rootContainer,
            panelBTrack,
            "summaryView"
        );

        // Lifted summaries live under root in layout but inherit data scopes
        // from imported tracks.
        /** @type {import("./concatView.js").default} */ (root).appendChildView(
            summaryA
        );
        /** @type {import("./concatView.js").default} */ (root).appendChildView(
            summaryB
        );

        const resolvedA = resolveParamSelector(root, {
            scope: ["panelA"],
            param: "threshold",
        });
        const resolvedB = resolveParamSelector(root, {
            scope: ["panelB"],
            param: "threshold",
        });

        expect(resolvedA).toBeDefined();
        expect(resolvedB).toBeDefined();
        expect(resolvedA.view).toBe(summaryA);
        expect(resolvedB.view).toBe(summaryB);
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

    test("validateSelectorConstraints ignores non-persisted params", async () => {
        const context = createTestViewContext();

        const spec = {
            vconcat: [
                makeUnitSpecWithParams("coverage", [
                    {
                        name: "hover",
                        select: { type: "point" },
                        persist: false,
                    },
                ]),
                makeUnitSpecWithParams("coverageB", [
                    {
                        name: "hover",
                        select: { type: "point" },
                        persist: false,
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
            issues.some((issue) => issue.message.includes("hover"))
        ).toBeFalsy();
    });
});
