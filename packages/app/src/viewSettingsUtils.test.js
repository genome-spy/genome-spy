// @ts-check
import { describe, expect, test, vi } from "vitest";
import { createHeadlessViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import {
    buildViewVisibilityEntries,
    getRadioVisibilityGroupsBySelector,
    resolveRadioVisibilityConflicts,
} from "./viewSettingsUtils.js";

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
    /**
     * @param {import("@genome-spy/core/spec/view.js").ViewSpec} spec
     */
    async function createRoot(spec) {
        const { view } = await createHeadlessViewHierarchy(spec);
        return view;
    }

    test("legacy keys apply to all matching views", async () => {
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

    test("resolves conflicting radio-group visibilities deterministically", async () => {
        const spec = {
            vconcat: [
                {
                    ...makeUnitSpec("coverageA"),
                    configurableVisibility: { group: "mode" },
                },
                {
                    ...makeUnitSpec("coverageB"),
                    configurableVisibility: { group: "mode" },
                },
            ],
        };

        const root = await createRoot(spec);

        const bySelector = getRadioVisibilityGroupsBySelector(root);
        const [{ memberKeys }] = Array.from(bySelector.values());

        const resolved = resolveRadioVisibilityConflicts(root, {});

        expect(resolved[memberKeys[0]]).toBeUndefined();
        expect(resolved[memberKeys[1]]).toBe(false);
    });

    test("keeps radio groups scoped to import instances", async () => {
        const spec = {
            templates: {
                panel: {
                    vconcat: [
                        {
                            ...makeUnitSpec("coverageA"),
                            configurableVisibility: { group: "mode" },
                        },
                        {
                            ...makeUnitSpec("coverageB"),
                            configurableVisibility: { group: "mode" },
                        },
                    ],
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

        const root = await createRoot(spec);

        const bySelector = getRadioVisibilityGroupsBySelector(root);
        const groupKeys = new Set(
            Array.from(bySelector.values(), (entry) => entry.groupKey)
        );

        expect(groupKeys.size).toBe(2);
        for (const entry of bySelector.values()) {
            expect(entry.memberKeys.length).toBe(2);
        }
    });

    test("groups named imported root views within their parent scope", async () => {
        const spec = {
            templates: {
                panel: {
                    ...makeUnitSpec("coverage"),
                    configurableVisibility: { group: "mode" },
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

        const root = await createRoot(spec);

        const bySelector = getRadioVisibilityGroupsBySelector(root);
        expect(bySelector.size).toBe(2);

        const groupKeys = new Set(
            Array.from(bySelector.values(), (entry) => entry.groupKey)
        );
        expect(groupKeys.size).toBe(1);

        for (const entry of bySelector.values()) {
            expect(entry.memberKeys.length).toBe(2);
        }

        const resolved = resolveRadioVisibilityConflicts(root, {});
        const entries = Array.from(bySelector.values());
        expect(resolved[entries[0].memberKeys[0]]).toBeUndefined();
        expect(resolved[entries[0].memberKeys[1]]).toBe(false);
    });
});
