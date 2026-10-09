import { afterEach, expect, test } from "vitest";
import { registerLazyDataSource } from "../data/sources/lazy/lazyDataSourceRegistry.js";
import IntervalUrlSource from "../data/sources/lazy/intervalUrlSource.js";
import { createAndInitialize } from "../view/testUtils.js";
import UnitView from "../view/unitView.js";

/** @type {(() => void)[]} */
const disposers = [];
afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
});

test("reports a later lazy failure and suppresses publication after disposal", async () => {
    /** @extends {IntervalUrlSource<object, import("../data/flowNode.js").Datum[][]>} */
    class FailingSource extends IntervalUrlSource {
        /**
         * @param {any} params
         * @param {import("../view/view.js").default} view
         */
        constructor(params, view) {
            super(view, "x");
            this.params = {
                ...params,
                windowSize: 20,
                debounce: 0,
                debounceMode: "window",
            };
            this.setupUrlLoading({
                loadModules: async () => ({}),
                createHandle: async () => {
                    throw new Error("Cannot open indexed data");
                },
            });
        }
    }
    disposers.push(
        registerLazyDataSource(
            /** @type {(params: import("../spec/data.js").LazyDataParams) => params is any} */ (
                (/** @type {any} */ params) => params.type === "testStatus"
            ),
            FailingSource
        )
    );
    const view = await createAndInitialize(
        {
            data: /** @type {any} */ ({
                lazy: { type: "testStatus", url: "data.bw" },
            }),
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 10] },
                },
            },
        },
        UnitView
    );
    disposers.push(() => view.disposeSubtree());
    const registry = view.context.dataFlow.loadingStatusRegistry;
    const source = /** @type {FailingSource} */ (view.flowHandle.dataSource);
    expect(registry.getSnapshot()).toEqual([]);
    const changes =
        /** @type {import("../types/embedApi.js").DataLoadingChange[]} */ ([]);
    registry.subscribe((change) => changes.push(change));

    await source.requestInterval([0, 10]);
    expect(
        changes.map((change) => change.type === "update" && change.entry.status)
    ).toEqual(["loading", "error"]);
    expect(registry.getSnapshot()[0]).toMatchObject({
        status: "error",
        message: "Cannot open indexed data",
    });
    expect(registry.getSnapshot()[0].errorPhase).toBeUndefined();

    const sourceId = registry.getSnapshot()[0].sourceId;
    source.dispose();
    expect(changes.at(-1)).toEqual({ type: "remove", sourceId });
    expect(registry.getSnapshot()).toEqual([]);
    changes.length = 0;
    await source.requestInterval([0, 10]);
    expect(changes).toEqual([]);
});
