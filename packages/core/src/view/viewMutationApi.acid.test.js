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

/**
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function makeInheritedDataAcidSpec() {
    return {
        name: "tracks",
        data: {
            values: [
                { pos: 1, value: 2, group: "a" },
                { pos: 2, value: 4, group: "b" },
            ],
        },
        transform: [
            {
                type: "formula",
                expr: "datum.value * 2",
                as: "scaledValue",
            },
        ],
        vconcat: [makeInheritedTrackSpec("trackA", "Track A")],
    };
}

/**
 * @param {string} name
 * @param {string} title
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeInheritedTrackSpec(name, title) {
    return {
        name,
        title,
        mark: "point",
        encoding: {
            x: { field: "pos", type: "quantitative" },
            y: { field: "scaledValue", type: "quantitative" },
            color: { field: "group", type: "nominal" },
        },
    };
}

/**
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function makeParamAcidSpec() {
    return {
        name: "tracks",
        params: [{ name: "threshold", value: 3 }],
        vconcat: [makeParamTrackSpec("trackA", "Track A")],
    };
}

/**
 * @param {string} name
 * @param {string} title
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeParamTrackSpec(name, title) {
    return {
        name,
        title,
        data: {
            values: [
                { pos: 1, value: 2 },
                { pos: 2, value: 4 },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "pos", type: "quantitative" },
            y: {
                field: "value",
                type: "quantitative",
                scale: { domain: { expr: "[0, threshold]" } },
            },
        },
    };
}

/**
 * @param {string} name
 * @param {string} title
 * @param {number} threshold
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeScopedParamTrackSpec(name, title, threshold) {
    const spec = makeParamTrackSpec(name, title);

    return {
        ...spec,
        params: [
            { name: "threshold", value: threshold },
            { name: "expandedThreshold", expr: "threshold + 1" },
        ],
        encoding: {
            ...spec.encoding,
            y: {
                field: "value",
                type: "quantitative",
                scale: { domain: { expr: "[0, expandedThreshold]" } },
            },
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

    test("restores inherited dataflow after inserting and removing an inherited track", async () => {
        const { view, api, context } = await createViewMutationAcidHarness(
            makeInheritedDataAcidSpec()
        );
        const baselineSnapshot = createMutationAcidSnapshot(view);
        const baselineIdentity = captureMutationAcidIdentities(view);
        const baselineDataSourceCount = context.dataFlow.dataSources.length;
        const baselineCollectorCount = context.dataFlow.collectors.length;
        const tracksView = getRequiredView(view, "tracks");

        // The inserted child has no local data declaration. It must inherit the
        // parent branch, including the parent formula transform, and then
        // dispose back to the baseline without reloading or duplicating sources.
        await api.transaction(async (views) => {
            const inserted = await views.insert(
                "root",
                makeInheritedTrackSpec("summary", "Summary"),
                { index: 1, scope: "summary" }
            );
            const insertedView = getRequiredView(view, "summary");

            expect(insertedView.dataParent).toBe(tracksView);
            expect(insertedView.flowHandle?.dataSource).toBeUndefined();
            expect(
                getCollectorData(insertedView).map((datum) => datum.scaledValue)
            ).toEqual([4, 8]);

            await views.remove(inserted);
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
        for (const [index, restoredView] of restoredIdentity.views.entries()) {
            expect(restoredView).toBe(baselineIdentity.views[index]);
            expect(restoredIdentity.collectors[index]).toBe(
                baselineIdentity.collectors[index]
            );
        }
    });

    test("keeps scoped params independent and disposes inserted subscriptions", async () => {
        const { view, api } =
            await createViewMutationAcidHarness(makeParamAcidSpec());
        const tracksView = getRequiredView(view, "tracks");
        const baselineHierarchy = createMutationAcidSnapshot(view).hierarchy;
        let rootThresholdCalls = 0;
        const unsubscribeRoot = tracksView.paramRuntime.subscribe(
            "threshold",
            () => {
                rootThresholdCalls += 1;
            }
        );

        try {
            /** @type {import("./view.js").default | undefined} */
            let insertedView;
            let expandedThresholdCalls = 0;

            // The inserted branch reuses the ancestor parameter name in its
            // own scope. Updating either scope must not cross-write the other,
            // and the inserted expression subscription must be disposed with
            // the removed branch.
            await api.transaction(async (views) => {
                const inserted = await views.insert(
                    "root",
                    makeScopedParamTrackSpec("scopedTrack", "Scoped", 7),
                    { scope: "sampleA" }
                );
                insertedView = getRequiredView(view, "scopedTrack");
                insertedView.paramRuntime.subscribe("expandedThreshold", () => {
                    expandedThresholdCalls += 1;
                });

                expect(
                    api.get({ scope: ["sampleA"], view: "scopedTrack" })
                ).toBe(inserted);
                expect(insertedView.paramRuntime.findValue("threshold")).toBe(
                    7
                );
                expect(
                    insertedView.paramRuntime.findValue("expandedThreshold")
                ).toBe(8);

                tracksView.paramRuntime.setValue("threshold", 4);
                await tracksView.paramRuntime.whenPropagated();

                expect(rootThresholdCalls).toBe(1);
                expect(insertedView.paramRuntime.findValue("threshold")).toBe(
                    7
                );

                insertedView.paramRuntime.setValue("threshold", 9);
                await insertedView.paramRuntime.whenPropagated();

                expect(
                    insertedView.paramRuntime.findValue("expandedThreshold")
                ).toBe(10);
                expect(expandedThresholdCalls).toBe(1);
                expect(tracksView.paramRuntime.findValue("threshold")).toBe(4);

                tracksView.paramRuntime.setValue("threshold", 3);
                await tracksView.paramRuntime.whenPropagated();
                await views.remove(inserted);
            });

            expect(insertedView?.paramRuntime.getValue("threshold")).toBe(
                undefined
            );

            tracksView.paramRuntime.setValue("threshold", 5);
            await tracksView.paramRuntime.whenPropagated();

            expect(rootThresholdCalls).toBe(3);
            expect(expandedThresholdCalls).toBe(1);

            tracksView.paramRuntime.setValue("threshold", 3);
            await tracksView.paramRuntime.whenPropagated();

            expect(rootThresholdCalls).toBe(4);
            expect(createMutationAcidSnapshot(view).hierarchy).toEqual(
                baselineHierarchy
            );
        } finally {
            unsubscribeRoot();
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

/**
 * @param {import("./view.js").default} view
 * @returns {import("../data/flowNode.js").Datum[]}
 */
function getCollectorData(view) {
    const collector = view.flowHandle?.collector;
    if (!collector) {
        throw new Error("Expected view to have a collector.");
    }

    return Array.from(collector.getData());
}
