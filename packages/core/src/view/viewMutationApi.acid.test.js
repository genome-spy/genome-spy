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

describe("View mutation acid scenarios", () => {
    test("restores the internal hierarchy after an immediately canceled mutation sequence", async () => {
        const { view, api } =
            await createViewMutationAcidHarness(makeAcidSpec());
        const baselineIdentity = captureMutationAcidIdentities(view);
        const baselineSnapshot = createMutationAcidSnapshot(view);

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

                for (const datum of data ?? []) {
                    this._propagate(datum);
                }

                this.complete();
            }
        }

        const unregister = registerLazyDataSource(
            (params) => /** @type {any} */ (params).type === "acidAsync",
            ControlledAsyncSource
        );

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
});
