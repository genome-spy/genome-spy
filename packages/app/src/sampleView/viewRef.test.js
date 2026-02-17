// @ts-check
import { describe, expect, test } from "vitest";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import { VIEW_ROOT_NAME } from "@genome-spy/core/view/viewFactory.js";
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

        const target = resolveViewSelector(root, {
            scope: ["panelA"],
            view: "coverage",
        });

        const viewRef = createViewRef(target);
        const resolved = resolveViewRef(root, viewRef);

        expect(resolved).toBe(target);
    });

    test("legacy view names error on ambiguity", async () => {
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

        expect(() => resolveViewRef(root, "coverage")).toThrow(
            /Multiple views named "coverage"/u
        );
    });

    test("legacy view names resolve when unique", async () => {
        const context = createTestViewContext();
        const spec = {
            vconcat: [makeUnitSpec("coverage")],
        };

        const root = await context.createOrImportView(
            spec,
            null,
            null,
            VIEW_ROOT_NAME
        );

        const resolved = resolveViewRef(root, "coverage");
        expect(resolved).toBeDefined();
        expect(resolved.explicitName).toBe("coverage");
    });
});
