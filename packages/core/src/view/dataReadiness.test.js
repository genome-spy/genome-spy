import { describe, expect, it } from "vitest";
import Collector from "../data/collector.js";
import DataSource from "../data/sources/dataSource.js";
import {
    awaitSubtreeLazyReady,
    buildReadinessRequest,
    isSubtreeLazyReady,
    isSubtreeReady,
} from "./dataReadiness.js";
import UnitView from "./unitView.js";

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
    collector.parent = dataSource;
    collector.completed = completed;

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
 * @param {{ready?: boolean, visible?: boolean}} [options]
 */
function createLazySubtree(options = {}) {
    const ready = options.ready ?? true;
    const visible = options.visible ?? true;
    const readyState = { value: ready };

    // Non-obvious: use UnitView's prototype so instanceof checks pass without full init.
    const unitView = Object.create(UnitView.prototype);
    unitView.isConfiguredVisible = () => visible;

    const dataSource = new (class extends DataSource {
        isDataReadyForDomain() {
            return readyState.value;
        }
    })(/** @type {import("./view.js").default} */ (/** @type {any} */ ({})));

    const collector = new Collector();

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
        readyState,
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
    };
}

describe("dataReadiness", () => {
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

    it("returns false when lazy readiness request is missing", () => {
        const { subtreeRoot } = createLazySubtree({ ready: true });

        expect(isSubtreeLazyReady(subtreeRoot, undefined)).toBe(false);
    });

    it("uses lazy source readiness for the requested domain", () => {
        const { subtreeRoot, readyState } = createLazySubtree({ ready: false });

        expect(isSubtreeLazyReady(subtreeRoot, { x: [0, 10] })).toBe(false);

        readyState.value = true;
        expect(isSubtreeLazyReady(subtreeRoot, { x: [0, 10] })).toBe(true);
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
