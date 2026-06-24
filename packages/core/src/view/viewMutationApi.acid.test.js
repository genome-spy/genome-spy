import { describe, expect, test } from "vitest";

import { createViewMutationApi } from "./viewMutationApi.js";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { renderToLayout } from "./testUtils.js";

/**
 * @param {string} name
 * @param {string} title
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeTrackSpec(name, title) {
    return {
        name,
        title,
        data: {
            values: [
                { pos: 1, value: 2, group: "a" },
                { pos: 2, value: 4, group: "b" },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "pos", type: "quantitative" },
            y: { field: "value", type: "quantitative" },
            color: { field: "group", type: "nominal" },
        },
    };
}

/**
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function makeAcidSpec() {
    return {
        name: "tracks",
        vconcat: [
            makeTrackSpec("trackA", "Track A"),
            makeTrackSpec("trackB", "Track B"),
        ],
        resolve: {
            scale: {
                x: "shared",
            },
        },
        config: {
            view: {
                stroke: "lightgray",
            },
        },
    };
}

/**
 * @param {import("./view.js").default} viewRoot
 */
function createHierarchySnapshot(viewRoot) {
    const views = viewRoot.getDescendants();
    const viewIndexes = new Map(views.map((view, index) => [view, index]));

    return views.map((view) => ({
        name: view.name,
        explicitName: view.explicitName,
        defaultName: view.defaultName,
        type: view.constructor.name,
        dataState: view.getDataInitializationState(),
        visibleInSpec: view.isVisibleInSpec(),
        configuredVisible: view.isConfiguredVisible(),
        layoutParent: getViewIndex(viewIndexes, view.layoutParent),
        dataParent: getViewIndex(viewIndexes, view.dataParent),
        children: getLayoutChildren(view).map((child) =>
            getRequiredViewIndex(viewIndexes, child)
        ),
        flowHandle: {
            dataSource: Boolean(view.flowHandle?.dataSource),
            collector: Boolean(view.flowHandle?.collector),
        },
        resolutions: createResolutionSnapshot(view, viewIndexes),
    }));
}

/**
 * @param {Map<import("./view.js").default, number>} viewIndexes
 * @param {import("./view.js").default | null | undefined} view
 */
function getViewIndex(viewIndexes, view) {
    return view ? getRequiredViewIndex(viewIndexes, view) : undefined;
}

/**
 * @param {Map<import("./view.js").default, number>} viewIndexes
 * @param {import("./view.js").default} view
 */
function getRequiredViewIndex(viewIndexes, view) {
    const index = viewIndexes.get(view);
    if (index === undefined) {
        throw new Error("Expected view to be included in the hierarchy.");
    }

    return index;
}

/**
 * @param {import("./view.js").default} view
 * @returns {import("./view.js").default[]}
 */
function getLayoutChildren(view) {
    const children = /** @type {{ children?: unknown }} */ (view).children;
    return Array.isArray(children)
        ? /** @type {import("./view.js").default[]} */ (children)
        : [];
}

/**
 * @param {import("./view.js").default} view
 * @param {Map<import("./view.js").default, number>} viewIndexes
 */
function createResolutionSnapshot(view, viewIndexes) {
    return {
        scale: Object.fromEntries(
            Object.entries(view.resolutions.scale)
                .filter((entry) => entry[1])
                .map(([channel, resolution]) => [
                    channel,
                    resolution.getOrderedMembers().map((member) => ({
                        view: getRequiredViewIndex(viewIndexes, member.view),
                        channel: member.channel,
                        contributesToDomain: member.contributesToDomain,
                    })),
                ])
        ),
        axis: Object.fromEntries(
            Object.entries(view.resolutions.axis)
                .filter((entry) => entry[1])
                .map(([channel, resolution]) => [
                    channel,
                    {
                        visible: resolution.hasVisibleNonChromeMember(),
                        title: resolution.getTitle(),
                    },
                ])
        ),
        legend: Object.fromEntries(
            Object.entries(view.resolutions.legend)
                .filter((entry) => entry[1])
                .map(([channel, resolution]) => [
                    channel,
                    {
                        visible: resolution.hasVisibleNonChromeMember(),
                        definitions: resolution
                            .getLegendDefs()
                            .map((definition) => ({
                                view: getRequiredViewIndex(
                                    viewIndexes,
                                    definition.view
                                ),
                                channel: definition.channel,
                                type: definition.type,
                                field: definition.field,
                            })),
                    },
                ])
        ),
    };
}

describe("View mutation acid scenarios", () => {
    test("restores the internal hierarchy after an immediately canceled mutation sequence", async () => {
        const { view } = await createHeadlessEngine(makeAcidSpec());
        const api = createViewMutationApi({ viewRoot: view });
        const baselineViews = view.getDescendants();
        const baselineCollectors = baselineViews.map(
            (descendant) => descendant.flowHandle?.collector
        );
        const baselineSnapshot = createHierarchySnapshot(view);
        const baselineLayout = renderToLayout(view);

        await api.transaction(async (views) => {
            const trackA = views.get({ scope: [], view: "trackA" });
            const summary = await views.insert(
                "root",
                makeTrackSpec("summary", "Summary"),
                { index: 1, scope: "summaryScope" }
            );

            await views.move(trackA, { index: 2 });
            await views.move(trackA, { index: 0 });
            await views.remove(summary);
        });

        expect(createHierarchySnapshot(view)).toEqual(baselineSnapshot);
        expect(renderToLayout(view)).toEqual(baselineLayout);

        const restoredViews = view.getDescendants();
        expect(restoredViews).toHaveLength(baselineViews.length);
        for (const [index, restoredView] of restoredViews.entries()) {
            expect(restoredView).toBe(baselineViews[index]);
            expect(restoredView.flowHandle?.collector).toBe(
                baselineCollectors[index]
            );
        }
    });
});
