import { describe, expect, test } from "vitest";

import DataSource from "../data/sources/dataSource.js";
import { loadViewSubtreeData } from "../data/flowInit.js";
import { registerLazyDataSource } from "../data/sources/lazy/lazyDataSourceRegistry.js";
import {
    captureMutationAcidIdentities,
    countCollectorRows,
    createDeferred,
    createMutationAcidSnapshot,
    createViewMutationAcidHarness,
    getRequiredView,
    waitUntil,
} from "./viewMutationAcidTestUtils.js";

// These acid scenarios intentionally drive mutations through the public
// ViewMutationApi. The assertions inspect normalized internal state because
// the goal is to catch stale views, dataflow objects, resolutions, and guides
// that remain after realistic public API operations.

/**
 * @typedef {{ pos: number, value: number, group: string }} TrackDatum
 */

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
 * @param {string} name
 * @param {string} title
 * @param {string} sourceId
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeAsyncTrackSpec(name, title, sourceId) {
    return {
        name,
        title,
        data: /** @type {any} */ ({
            lazy: {
                type: "acidAsync",
                sourceId,
            },
        }),
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
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function makeAsyncAcidSpec() {
    return {
        name: "tracks",
        vconcat: [makeAsyncTrackSpec("trackA", "Track A", "shared")],
        resolve: {
            scale: {
                x: "shared",
            },
        },
    };
}

/**
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function makeSharedGuideAcidSpec() {
    return {
        name: "tracks",
        vconcat: [
            makeTrackSpec("trackA", "Track A"),
            makeTrackSpec("trackB", "Track B"),
        ],
        resolve: {
            axis: { x: "shared" },
            scale: { x: "shared", color: "shared" },
            legend: { color: "shared" },
        },
    };
}

describe("View mutation acid scenarios", () => {
    test("restores the internal hierarchy after an immediately canceled mutation sequence", async () => {
        const { view, api } =
            await createViewMutationAcidHarness(makeAcidSpec());
        const baselineIdentity = captureMutationAcidIdentities(view);
        const baselineSnapshot = createMutationAcidSnapshot(view);

        // This is the core acid invariant: a complex no-op mutation round trip
        // must restore the normalized internal hierarchy and preserve the
        // pre-existing view/collector objects.
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

        expect(createMutationAcidSnapshot(view)).toEqual(baselineSnapshot);

        const restoredIdentity = captureMutationAcidIdentities(view);
        expect(restoredIdentity.views).toHaveLength(
            baselineIdentity.views.length
        );
        for (const [index, restoredView] of restoredIdentity.views.entries()) {
            expect(restoredView).toBe(baselineIdentity.views[index]);
            expect(restoredIdentity.collectors[index]).toBe(
                baselineIdentity.collectors[index]
            );
        }
    });

    test("feeds an inserted lazy branch while a shared source is loading", async () => {
        // The deferred second load keeps the shared data source in flight while
        // the new branch is inserted. The inserted view must attach to that
        // source and receive propagated rows once the load completes.
        /** @type {{ promise: Promise<TrackDatum[]>, resolve: (value: TrackDatum[]) => void, reject: (reason?: unknown) => void }} */
        const secondLoad = createDeferred();
        /** @type {Promise<TrackDatum[]>[]} */
        const loadPlans = [
            Promise.resolve([{ pos: 1, value: 2, group: "a" }]),
            secondLoad.promise,
            Promise.resolve([{ pos: 3, value: 4, group: "b" }]),
        ];
        /** @type {DataSource[]} */
        const loadCalls = [];

        const unregister = registerControlledAsyncSource(loadPlans, loadCalls);

        try {
            const { view, api } =
                await createViewMutationAcidHarness(makeAsyncAcidSpec());
            const source = getRequiredView(view, "trackA").flowHandle
                ?.dataSource;
            if (!source) {
                throw new Error("Expected trackA to have a data source.");
            }

            const inFlightLoad = loadViewSubtreeData(view, new Set([source]));
            const insertPromise = api.insert(
                "root",
                makeAsyncTrackSpec("trackB", "Track B", "shared"),
                { scope: "trackB" }
            );

            await waitUntil(() =>
                view.getDescendants().some((child) => child.name === "trackB")
            );
            secondLoad.resolve([{ pos: 2, value: 3, group: "a" }]);

            await insertPromise;
            await inFlightLoad;

            const insertedView = getRequiredView(view, "trackB");
            expect(loadCalls).toHaveLength(3);
            expect(insertedView.flowHandle?.dataSource).toBe(source);
            expect(countCollectorRows(insertedView)).toBeGreaterThan(0);
        } finally {
            unregister();
        }
    });

    test("restores hierarchy after canceling an async inserted branch", async () => {
        // Async insertion creates dataflow state that must be fully disposed
        // when the branch is immediately removed again.
        /** @type {Promise<TrackDatum[]>[]} */
        const loadPlans = [
            Promise.resolve([{ pos: 1, value: 2, group: "a" }]),
            Promise.resolve([{ pos: 5, value: 8, group: "b" }]),
        ];
        /** @type {DataSource[]} */
        const loadCalls = [];
        const unregister = registerControlledAsyncSource(loadPlans, loadCalls);

        try {
            const { view, api, context } =
                await createViewMutationAcidHarness(makeAsyncAcidSpec());
            const baselineIdentity = captureMutationAcidIdentities(view);
            const baselineSnapshot = createMutationAcidSnapshot(view);
            const baselineDataSourceCount = context.dataFlow.dataSources.length;
            const baselineCollectorCount = context.dataFlow.collectors.length;

            await api.transaction(async (views) => {
                const trackA = views.get({ scope: [], view: "trackA" });
                const temporary = await views.insert(
                    "root",
                    makeAsyncTrackSpec(
                        "temporary",
                        "Temporary async track",
                        "temporary"
                    ),
                    { index: 1, scope: "temporary" }
                );

                await views.move(trackA, { index: 1 });
                await views.move(trackA, { index: 0 });
                await views.remove(temporary);
            });

            expect(createMutationAcidSnapshot(view)).toEqual(baselineSnapshot);
            expect(context.dataFlow.dataSources).toHaveLength(
                baselineDataSourceCount
            );
            expect(context.dataFlow.collectors).toHaveLength(
                baselineCollectorCount
            );

            const restoredIdentity = captureMutationAcidIdentities(view);
            expect(restoredIdentity.views).toHaveLength(
                baselineIdentity.views.length
            );
            for (const [
                index,
                restoredView,
            ] of restoredIdentity.views.entries()) {
                expect(restoredView).toBe(baselineIdentity.views[index]);
                expect(restoredIdentity.collectors[index]).toBe(
                    baselineIdentity.collectors[index]
                );
            }
            expect(loadCalls).toHaveLength(2);
        } finally {
            unregister();
        }
    });

    test("keeps shared guide ownership live after add move and remove", async () => {
        const { view, api } = await createViewMutationAcidHarness(
            makeSharedGuideAcidSpec()
        );
        const trackAView = getRequiredView(view, "trackA");
        const trackA = api.get({ scope: [], view: "trackA" });
        expect(getLegendDefinitionNames(view, "tracks", "color")).toEqual([
            "trackA",
        ]);

        // Removing the original guide owner should transfer shared legend
        // ownership to a remaining live child and should not leave stale
        // resolution members behind.
        const inserted = await api.insert(
            "root",
            makeTrackSpec("trackC", "Track C"),
            { index: 0, scope: "trackC" }
        );
        await api.move(inserted, { index: 2 });
        await api.remove(trackA);

        const liveViews = new Set(view.getDescendants());
        expect(liveViews.has(trackAView)).toBe(false);
        expect(
            getScaleMemberNames(view, "tracks", "x").filter((name) =>
                name.startsWith("track")
            )
        ).toEqual(["trackB", "trackC"]);
        expect(getLegendDefinitionNames(view, "tracks", "color")).toEqual([
            "trackB",
        ]);

        for (const owner of getLegendDefinitionViews(view, "tracks", "color")) {
            expect(liveViews.has(owner)).toBe(true);
        }
    });
});

/**
 * @param {Promise<TrackDatum[]>[]} loadPlans
 * @param {DataSource[]} loadCalls
 */
function registerControlledAsyncSource(loadPlans, loadCalls) {
    class ControlledAsyncSource extends DataSource {
        /**
         * @param {{ sourceId: string }} params
         * @param {import("./view.js").default} view
         */
        constructor(params, view) {
            super(view);
            this.params = params;
        }

        get identifier() {
            return this.params.sourceId;
        }

        async load() {
            loadCalls.push(this);
            const data = await loadPlans.shift();
            this.reset();
            this.beginBatch({ type: "file" });

            // Propagate rows through the real dataflow path so the tests cover
            // collector wiring, not just source registration.
            for (const datum of data ?? []) {
                this._propagate(datum);
            }

            this.complete();
        }
    }

    return registerLazyDataSource(
        (params) => /** @type {any} */ (params).type === "acidAsync",
        ControlledAsyncSource
    );
}

/**
 * @param {import("./view.js").default} viewRoot
 * @param {string} viewName
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {string[]}
 */
function getScaleMemberNames(viewRoot, viewName, channel) {
    const resolution = getRequiredView(viewRoot, viewName).resolutions.scale[
        channel
    ];
    if (!resolution) {
        throw new Error("Expected scale resolution for channel: " + channel);
    }

    return resolution.getOrderedMembers().map((member) => member.view.name);
}

/**
 * @param {import("./view.js").default} viewRoot
 * @param {string} viewName
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {string[]}
 */
function getLegendDefinitionNames(viewRoot, viewName, channel) {
    return getLegendDefinitionViews(viewRoot, viewName, channel).map(
        (view) => view.name
    );
}

/**
 * @param {import("./view.js").default} viewRoot
 * @param {string} viewName
 * @param {import("../spec/channel.js").ChannelWithScale} channel
 * @returns {import("./view.js").default[]}
 */
function getLegendDefinitionViews(viewRoot, viewName, channel) {
    const resolution = getRequiredView(viewRoot, viewName).resolutions.legend[
        channel
    ];
    if (!resolution) {
        throw new Error("Expected legend resolution for channel: " + channel);
    }

    return resolution.getLegendDefs().map((definition) => definition.view);
}
