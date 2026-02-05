import { describe, expect, test, vi } from "vitest";
import { createTestViewContext } from "@genome-spy/core/view/testUtils.js";
import { VIEW_ROOT_NAME } from "@genome-spy/core/view/viewFactory.js";
import { buildViewVisibilityEntries } from "./viewSettingsUtils.js";

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

describe("view visibility entries", () => {
    test("legacy keys apply to all matching views", async () => {
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

        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const entries = buildViewVisibilityEntries(root, {
            coverage: false,
        });

        expect(entries).toHaveLength(2);
        expect(entries).toEqual(
            expect.arrayContaining([
                { scope: ["panelA"], view: "coverage", visible: false },
                { scope: ["panelB"], view: "coverage", visible: false },
            ])
        );
        expect(warn).toHaveBeenCalled();

        warn.mockRestore();
    });
});
