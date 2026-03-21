// @ts-check
import { describe, expect, test } from "vitest";
import { createHeadlessViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import { validateSelectorConstraints } from "./viewSelectorConstraints.js";

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

describe("app selector constraints", () => {
    /**
     * @param {import("@genome-spy/core/spec/view.js").ViewSpec} spec
     */
    async function createRoot(spec) {
        const { view } = await createHeadlessViewHierarchy(spec);
        return view;
    }

    test("reports duplicate configurable view names", async () => {
        const spec = {
            vconcat: [makeUnitSpec("coverage"), makeUnitSpec("coverage")],
        };

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) => issue.message.includes("coverage"))
        ).toBeTruthy();
    });

    test("ignores duplicate view names across named import scopes", async () => {
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

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(issues.length).toBe(0);
    });

    test("flags duplicate view names in root scope", async () => {
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

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) => issue.message.includes("coverage"))
        ).toBeTruthy();
    });

    test("allows unnamed imports with unique view names", async () => {
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

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(issues.length).toBe(0);
    });

    test("flags explicitly configurable views without an explicit name", async () => {
        const spec = {
            vconcat: [
                {
                    ...makeUnitSpec("coverage"),
                    name: undefined,
                    configurableVisibility: true,
                },
            ],
        };

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) =>
                issue.message.includes(
                    "Configurable view must have an explicit name"
                )
            )
        ).toBeTruthy();
    });

    test("flags invalid configurable visibility group definitions", async () => {
        const spec = {
            vconcat: [
                {
                    ...makeUnitSpec("coverage"),
                    configurableVisibility: {
                        group: "",
                    },
                },
            ],
        };

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some((issue) =>
                issue.message.includes(
                    "Configurable visibility group must be a non-empty string"
                )
            )
        ).toBeTruthy();
    });

    test("accepts configurable visibility group definitions", async () => {
        const spec = {
            vconcat: [
                {
                    ...makeUnitSpec("coverage"),
                    configurableVisibility: {
                        group: "mode",
                    },
                },
            ],
        };

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(issues.length).toBe(0);
    });

    test("flags duplicate import instance names for configurable views", async () => {
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
                    name: "panel",
                },
                {
                    import: { template: "panelB" },
                    name: "panel",
                },
            ],
        };

        const root = await createRoot(spec);

        const issues = validateSelectorConstraints(root);
        expect(
            issues.some(
                (issue) =>
                    issue.message.includes("Import instance name") &&
                    issue.message.includes("panel")
            )
        ).toBeTruthy();
    });
});
