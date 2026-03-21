// @ts-check
import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import { resolveViewSelector } from "@genome-spy/core/view/viewSelectors.js";
import { createViewRef, resolveViewRef } from "./viewRef.js";

/**
 * @param {string} name
 * @returns {import("@genome-spy/core/spec/view.js").UnitSpec}
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
 * @returns {import("@genome-spy/core/spec/view.js").ViewSpec}
 */
const makeTemplate = () => ({
    vconcat: [makeUnitSpec("coverage")],
});

describe("view refs", () => {
    test("selector view refs resolve to the intended view", async () => {
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

        const { view: root } = await createHeadlessEngine(spec);

        const target = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "coverage",
        });

        const viewRef = createViewRef(target);
        const resolved = resolveViewRef(root, viewRef);

        expect(resolved).toBe(target);
    });

    test("legacy view names error on ambiguity", async () => {
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

        const { view: root } = await createHeadlessEngine(spec);

        expect(() => resolveViewRef(root, "coverage")).toThrow(
            /Multiple views named "coverage"/u
        );
    });

    test("legacy view names resolve when unique", async () => {
        const spec = {
            vconcat: [makeUnitSpec("coverage")],
        };

        const { view: root } = await createHeadlessEngine(spec);

        const resolved = resolveViewRef(root, "coverage");
        expect(resolved).toBeDefined();
        expect(resolved.explicitName).toBe("coverage");
    });
});
