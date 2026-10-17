// @ts-check
import { describe, expect, test, vi } from "vitest";
import { createHeadlessViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import {
    buildViewVisibilityEntries,
    getRadioVisibilityGroupsBySelector,
    resolveRadioVisibilityConflicts,
    makeViewSelectorKey,
    normalizeViewSettingsPayload,
} from "./viewSettingsUtils.js";
import { getAddressableViews } from "@genome-spy/core/view/viewSelectors.js";
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

describe("view visibility entries", () => {
    /**
     * @param {import("@genome-spy/core/spec/view.js").ViewSpec} spec
     */
    async function createRoot(spec) {
        const { view } = await createHeadlessViewHierarchy(spec);
        return view;
    }

    test("surround side groups and tracks retain bookmarkable authored selectors", async () => {
        /** @type {import("./spec/view.js").AppSurroundSpec} */
        const spec = {
            name: "surround",
            spec: makeUnitSpec("matrix"),
            surround: {
                right: {
                    name: "metadata",
                    configurableVisibility: true,
                    views: [{ ...makeUnitSpec("track"), width: 20 }],
                },
            },
        };
        // App's recursive types also allow SampleView; this fixture uses Core plots.
        const root = await createRoot(
            /** @type {import("@genome-spy/core/spec/view.js").ViewSpec} */ (
                /** @type {unknown} */ (spec)
            )
        );
        expect(
            getAddressableViews(root).map((view) => view.explicitName)
        ).toEqual(["surround", "matrix", "metadata", "track"]);
        expect(validateSelectorConstraints(root)).toEqual([]);

        const expected = [
            { scope: [], view: "metadata", visible: false },
            { scope: [], view: "track", visible: false },
        ];
        const visibilities = Object.fromEntries(
            expected.map((entry) => [makeViewSelectorKey(entry), entry.visible])
        );
        const entries = buildViewVisibilityEntries(root, visibilities);
        expect(entries).toEqual(expected);
        expect(normalizeViewSettingsPayload({ visibilities: entries })).toEqual(
            { visibilities }
        );
    });

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
