import { afterEach, describe, expect, it, vi } from "vitest";
import LoadingStatusRegistry from "../genomeSpy/loadingStatusRegistry.js";
import Collector from "../data/collector.js";
import DataSource from "../data/sources/dataSource.js";
import SingleAxisLazySource from "../data/sources/lazy/singleAxisLazySource.js";
import {
    awaitSubtreeLazyReady,
    buildReadinessRequest,
    isSubtreeLazyReady,
    isSubtreeReady,
} from "./dataReadiness.js";
import UnitView from "./unitView.js";
import { createBroadcastingTestViewContext } from "./testUtils.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { registerLazyDataSource } from "../data/sources/lazy/lazyDataSourceRegistry.js";

/**
 * @param {{ready?: boolean, completed?: boolean}} [options]
 */
function createReadySubtree(options = {}) {
    const ready = options.ready ?? true;
    const completed = options.completed ?? true;

    // Non-obvious: use UnitView's prototype so instanceof checks pass without full init.
    const unitView = Object.create(UnitView.prototype);
    unitView.isConfiguredVisible = () => true;

    const dataSource = new (class extends DataSource {
        isDataReadyForDomain() {
            return ready;
        }
    })(/** @type {import("./view.js").default} */ (/** @type {any} */ ({})));

    const collector = new Collector();
    dataSource.addChild(collector);
    if (completed) {
        dataSource.complete();
    }

    unitView.flowHandle = { collector };

    return {
        subtreeRoot: /** @type {import("./view.js").default} */ (
            /** @type {any} */ ({
                getDescendants: () => [unitView],
            })
        ),
    };
}

/**
 * @param {{ready?: boolean, visible?: boolean, opacity?: number}} [options]
 */
function createLazySubtree(options = {}) {
    const ready = options.ready ?? true;
    const visible = options.visible ?? true;
    const opacity = options.opacity ?? 1;
    const readyState = { value: ready };
    /** @type {number[][]} */
    const requests = [];

    // Non-obvious: use UnitView's prototype so instanceof checks pass without full init.
    const unitView = Object.create(UnitView.prototype);
    unitView.isConfiguredVisible = () => visible;
    unitView.getEffectiveOpacity = () => opacity;

    unitView.getScaleResolution = () => ({ getDomain: () => [0, 10] });
    const dataSource = new (class extends SingleAxisLazySource {
        constructor() {
            super(unitView, "x");
            this.publishData([], [0, 10]);
        }

        isDataReadyForDomain() {
            return readyState.value;
        }

        /** @param {number[]} domain */
        ensureDataForDomain(domain) {
            requests.push(domain);
        }
    })();

    const collector = new Collector();
    dataSource.addChild(collector);
    dataSource.complete();

    unitView.flowHandle = { collector, dataSource };

    return {
        subtreeRoot: /** @type {import("./view.js").default} */ (
            /** @type {any} */ ({
                /**
                 * @param {(view: import("./view.js").default) => void} visitor
                 */
                visit: (visitor) => visitor(unitView),
            })
        ),
        collector,
        dataSource,
        readyState,
        requests,
    };
}

function createContextStub() {
    /** @type {Set<(message: any) => void>} */
    const listeners = new Set();

    return {
        /**
         * @param {string} type
         * @param {(message: any) => void} listener
         */
        addBroadcastListener: (type, listener) => {
            if (type === "subtreeDataReady") {
                listeners.add(listener);
            }
        },
        /**
         * @param {string} type
         * @param {(message: any) => void} listener
         */
        removeBroadcastListener: (type, listener) => {
            if (type === "subtreeDataReady") {
                listeners.delete(listener);
            }
        },
        getListenerCount: () => listeners.size,
        dataFlow: { loadingStatusRegistry: new LoadingStatusRegistry() },
    };
}

describe("dataReadiness", () => {
    it("cleans up subscriptions when a lazy request throws", async () => {
        const { subtreeRoot, collector, dataSource } = createLazySubtree({
            ready: false,
        });
        dataSource.ensureDataForDomain = () => {
            throw new Error("unavailable");
        };
        const context = createContextStub();
        await expect(
            awaitSubtreeLazyReady(/** @type {any} */ (context), subtreeRoot, {
                x: [0, 10],
            })
        ).rejects.toThrow("unavailable");
        expect(collector.observers.size).toBe(0);
        expect(context.getListenerCount()).toBe(0);
    });
    it("builds readiness requests from scale domains", () => {
        const view = /** @type {import("./view.js").default} */ (
            /** @type {any} */ ({
                /**
                 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
                 */
                getScaleResolution: (channel) =>
                    channel === "x" ? { getDomain: () => [0, 10] } : undefined,
            })
        );

        expect(buildReadinessRequest(view, ["x"])).toEqual({ x: [0, 10] });
    });

    it("reports readiness when collectors are complete and data is ready", () => {
        const { subtreeRoot } = createReadySubtree();

        expect(isSubtreeReady(subtreeRoot, { x: [0, 10] })).toBe(true);
    });

    it("returns false when collectors are not complete", () => {
        const { subtreeRoot } = createReadySubtree({ completed: false });

        expect(isSubtreeReady(subtreeRoot, { x: [0, 10] })).toBe(false);
    });

    it("returns false when data is not ready for the requested domain", () => {
        const { subtreeRoot } = createReadySubtree({ ready: false });

        expect(isSubtreeReady(subtreeRoot, { x: [0, 10] })).toBe(false);
    });

    it("treats non-lazy sources as ready for lazy readiness checks", () => {
        // Non-obvious: dataSource lacks isDataReadyForDomain and should be ignored.
        const unitView = Object.create(UnitView.prototype);
        unitView.isConfiguredVisible = () => true;
        unitView.getEffectiveOpacity = () => 1;
        unitView.flowHandle = {
            dataSource: new DataSource(
                /** @type {import("./view.js").default} */ (
                    /** @type {any} */ ({})
                )
            ),
        };

        const subtreeRoot = /** @type {import("./view.js").default} */ (
            /** @type {any} */ ({
                /**
                 * @param {(view: import("./view.js").default) => void} visitor
                 */
                visit: (visitor) => visitor(unitView),
            })
        );

        expect(isSubtreeLazyReady(subtreeRoot, undefined)).toBe(true);
    });

    it("uses current domains when lazy readiness request is missing", () => {
        const { subtreeRoot, readyState } = createLazySubtree({ ready: false });

        expect(isSubtreeLazyReady(subtreeRoot, undefined)).toBe(false);

        readyState.value = true;
        expect(isSubtreeLazyReady(subtreeRoot, undefined)).toBe(true);
    });

    it("uses lazy source readiness for the requested domain", () => {
        const { subtreeRoot, readyState } = createLazySubtree({ ready: false });

        expect(isSubtreeLazyReady(subtreeRoot, { x: [0, 10] })).toBe(false);

        readyState.value = true;
        expect(isSubtreeLazyReady(subtreeRoot, { x: [0, 10] })).toBe(true);
    });

    it("ignores lazy views with zero effective opacity", () => {
        const { subtreeRoot } = createLazySubtree({
            ready: false,
            opacity: 0,
        });

        expect(isSubtreeLazyReady(subtreeRoot, undefined)).toBe(true);
    });

    it("awaits lazy readiness after collector completion", async () => {
        const { subtreeRoot, collector, readyState } = createLazySubtree({
            ready: false,
        });
        const context = createContextStub();

        const promise = awaitSubtreeLazyReady(
            /** @type {import("../types/viewContext.js").default} */ (
                /** @type {any} */ (context)
            ),
            subtreeRoot,
            { x: [0, 10] }
        );

        readyState.value = true;
        collector.complete();

        await expect(promise).resolves.toBeUndefined();
        expect(context.getListenerCount()).toBe(0);
    });

    it("requests unavailable lazy data when awaiting readiness", async () => {
        const { subtreeRoot, requests, readyState, collector } =
            createLazySubtree({
                ready: false,
            });
        const context = createContextStub();

        const promise = awaitSubtreeLazyReady(
            /** @type {import("../types/viewContext.js").default} */ (
                /** @type {any} */ (context)
            ),
            subtreeRoot,
            { x: [0, 10] }
        );

        expect(requests).toEqual([[0, 10]]);

        readyState.value = true;
        collector.complete();

        await expect(promise).resolves.toBeUndefined();
    });

    it("requests the checked lazy data domain", async () => {
        const { subtreeRoot, requests } = createLazySubtree({
            ready: false,
        });
        const context = createContextStub();
        const controller = new AbortController();

        const promise = awaitSubtreeLazyReady(
            /** @type {import("../types/viewContext.js").default} */ (
                /** @type {any} */ (context)
            ),
            subtreeRoot,
            { x: [2, 8] },
            controller.signal
        );

        expect(requests).toEqual([[2, 8]]);

        controller.abort();
        await expect(promise).rejects.toThrow(
            "Lazy subtree readiness was aborted."
        );
    });

    it("rejects lazy readiness on abort", async () => {
        const { subtreeRoot } = createLazySubtree({ ready: false });
        const context = createContextStub();
        const controller = new AbortController();

        const promise = awaitSubtreeLazyReady(
            /** @type {import("../types/viewContext.js").default} */ (
                /** @type {any} */ (context)
            ),
            subtreeRoot,
            { x: [0, 10] },
            controller.signal
        );

        controller.abort();

        await expect(promise).rejects.toThrow(
            "Lazy subtree readiness was aborted."
        );
        expect(context.getListenerCount()).toBe(0);
    });
});

/** Controlled loading at the real spec-to-dataflow boundary. */
class ControlledSource extends SingleAxisLazySource {
    requests = 0;

    /** @param {any} params @param {import("./view.js").default} view */
    constructor(params, view) {
        super(view, "x");
    }

    onDomainChanged() {
        this.requests++;
        this.setLoadingStatus("loading");
    }

    fail() {
        this.setLoadingStatus("error", "Indexed data failed");
    }

    succeed() {
        this.publishData([[{ x: 1, key: 1, label: "A" }]], [0, 10]);
        this.setLoadingStatus("complete");
    }
}

/** @type {(() => void)[]} */
const disposers = [];
afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    vi.unstubAllGlobals();
});

/** @param {import("../spec/root.js").RootSpec} spec */
async function createLoadingGraph(spec) {
    disposers.push(
        registerLazyDataSource(
            /** @type {(params: import("../spec/data.js").LazyDataParams) => params is any} */
            ((/** @type {any} */ params) => params.type === "controlledStatus"),
            ControlledSource
        )
    );
    const context = createBroadcastingTestViewContext();
    const root = await context.createOrImportView(spec, null, null, "root");
    disposers.push(() => root.disposeSubtree());
    const { dataSources } = initializeViewSubtree(root, context.dataFlow);
    await loadViewSubtreeData(root, dataSources);
    const lazy = context.dataFlow.dataSources.filter(
        (source) => source instanceof ControlledSource
    );
    return { context, root, lazy };
}

const controlledData = /** @type {any} */ ({
    lazy: { type: "controlledStatus" },
});
const xEncoding = /** @type {import("../spec/channel.js").Encoding} */ ({
    x: { field: "x", type: "quantitative", scale: { domain: [0, 10] } },
});

it.each(["before", "during"])(
    "rejects an inherited loading failure %s a wait without retrying",
    async (timing) => {
        const {
            context,
            root,
            lazy: [source],
        } = await createLoadingGraph({
            data: controlledData,
            encoding: xEncoding,
            layer: [{ mark: "point" }, { mark: "point" }],
        });
        if (timing === "before") source.fail();
        const requests = source.requests;
        const wait = awaitSubtreeLazyReady(context, root, { x: [0, 10] });
        if (timing === "during") source.fail();
        await expect(wait).rejects.toThrow("Indexed data failed");
        expect(source.requests).toBe(requests + (timing === "during" ? 1 : 0));
    }
);

it.each(["primary", "side"])(
    "rejects failed eager %s data required by a lazy branch",
    async (failure) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("", { status: 404 }))
        );
        const missing = { url: "missing.csv" };
        const {
            context,
            root,
            lazy: [source],
        } = await createLoadingGraph({
            data: failure === "primary" ? missing : controlledData,
            transform: [
                failure === "primary"
                    ? {
                          type: "coordinateLookup",
                          from: { data: controlledData },
                          key: "x",
                          values: ["label"],
                      }
                    : {
                          type: "lookup",
                          from: missing,
                          key: "key",
                          fields: ["key"],
                          values: ["label"],
                      },
            ],
            mark: "point",
            encoding: xEncoding,
        });
        const requests = source.requests;
        await expect(
            awaitSubtreeLazyReady(context, root, undefined)
        ).rejects.toThrow("missing.csv");
        expect(source.requests).toBe(requests);
    }
);

it("ignores hidden and wholly eager failures while waiting for a successful visible lazy branch", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("", { status: 404 }))
    );
    const { context, root, lazy } = await createLoadingGraph({
        vconcat: [
            {
                name: "visible",
                data: controlledData,
                mark: "point",
                encoding: xEncoding,
            },
            {
                name: "hidden",
                data: controlledData,
                mark: "point",
                encoding: xEncoding,
            },
            { data: { url: "unrelated.csv" }, mark: "point" },
        ],
    });
    context.isViewConfiguredVisible = (view) => view.name !== "hidden";
    lazy.find((source) => source.view.name === "hidden").fail();
    const wait = awaitSubtreeLazyReady(context, root, { x: [0, 10] });
    lazy.find((source) => source.view.name === "visible").succeed();
    await expect(wait).resolves.toBeUndefined();
});
