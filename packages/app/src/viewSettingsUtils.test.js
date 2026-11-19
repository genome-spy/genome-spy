// @ts-check
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import {
    buildViewSettingsPayload,
    getRadioVisibilityGroupsBySelector,
    getRadioHiddenViews,
    getViewVisibilityKeys,
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

    test("a named view inside an empty import scope uses view-local visibility", async () => {
        const root = await createRoot({
            templates: { panel: makeTemplate() },
            vconcat: [{ name: "", import: { template: "panel" } }],
        });
        const coverage = root
            .getDescendants()
            .find((view) => view.name === "coverage");
        expect(coverage).toBeDefined();
        expect(getViewVisibilityKeys(root).has(coverage)).toBe(false);
    });

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
        const payload = buildViewSettingsPayload(root, { visibilities });
        expect(payload).toEqual({ visibilities: expected });
        expect(normalizeViewSettingsPayload(payload)).toEqual({ visibilities });
    });

    test("legacy keys apply to manual matches across import instances", async () => {
        const spec = {
            templates: {
                panel: makeTemplate(),
                detail: {
                    vconcat: [
                        {
                            ...makeUnitSpec("coverage"),
                            visible: { expr: "true" },
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
                { import: { template: "detail" }, name: "panelC" },
            ],
        };

        const root = await createRoot(spec);

        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const stale = makeViewSelectorKey({
            scope: ["panelC"],
            view: "coverage",
        });
        const settings = normalizeViewSettingsPayload(
            {
                visibilities: {
                    coverage: false,
                    [stale]: false,
                    futureTrack: true,
                    invalidChoice: /** @type {any} */ ("false"),
                },
            },
            root
        );
        expect(settings.visibilities).not.toHaveProperty(stale);
        expect(settings.visibilities.futureTrack).toBe(true);
        expect(settings.visibilities).not.toHaveProperty("invalidChoice");
        const entries = buildViewSettingsPayload(root, settings).visibilities;

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

    test("keeps scoped choices distinct from view names that look like selectors", async () => {
        const entry = { scope: [], view: "manual", visible: false };
        const key = makeViewSelectorKey(entry);
        const root = await createRoot({
            vconcat: [
                makeUnitSpec(entry.view),
                { ...makeUnitSpec(key), visible: { expr: "true" } },
            ],
        });
        onTestFinished(() => root.disposeSubtree());
        const settings = { visibilities: { [key]: false } };
        const payload = { visibilities: [entry] };
        expect(normalizeViewSettingsPayload(payload, root)).toEqual(settings);
        expect(buildViewSettingsPayload(root, settings)).toEqual(payload);
    });

    test("resolves conflicting radio-group visibilities deterministically", async () => {
        const spec = {
            vconcat: [
                {
                    ...makeUnitSpec("detail"),
                    visible: { expr: "true" },
                    configurableVisibility: { group: "mode" },
                },
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

        const bySelector = getRadioVisibilityGroupsBySelector(
            getViewVisibilityKeys(root)
        );
        const [{ members }] = bySelector.values();
        const memberKeys = members.map((member) => member.selectorKey);

        expect(memberKeys).toHaveLength(2);
        expect(
            buildViewSettingsPayload(root, { visibilities: {} })
        ).toBeUndefined();
        const choices = {
            [memberKeys[0]]: false,
            [memberKeys[1]]: true,
            detail: true,
        };
        expect(
            buildViewSettingsPayload(root, { visibilities: choices })
                .visibilities
        ).toEqual([
            { scope: [], view: "coverageA", visible: false },
            { scope: [], view: "coverageB", visible: true },
        ]);
        expect(getRadioHiddenViews(bySelector, {})).toEqual(
            new Set([members[1].view])
        );
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

        const bySelector = getRadioVisibilityGroupsBySelector(
            getViewVisibilityKeys(root)
        );
        const groupKeys = new Set(
            Array.from(bySelector.values(), (entry) => entry.groupKey)
        );

        expect(groupKeys.size).toBe(2);
        for (const entry of bySelector.values()) {
            expect(entry.members.length).toBe(2);
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

        const bySelector = getRadioVisibilityGroupsBySelector(
            getViewVisibilityKeys(root)
        );
        expect(bySelector.size).toBe(2);

        const groupKeys = new Set(
            Array.from(bySelector.values(), (entry) => entry.groupKey)
        );
        expect(groupKeys.size).toBe(1);

        const [{ members }] = bySelector.values();
        expect(members).toHaveLength(2);
        expect(getRadioHiddenViews(bySelector, {})).toEqual(
            new Set([members[1].view])
        );
    });
});
