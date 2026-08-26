/**
 * Renderer-neutral, revisioned placement data owned by a layout producer.
 *
 * The source contains complete topology independently of the currently
 * presented occurrences. Backends derive their own resources from snapshots
 * and subscribe only to the source's disposal notification.
 */
import {
    countPerformance,
    measurePerformance,
} from "../../debug/performanceProfiler.js";

/** @typedef {{ revision: number, facetIds: readonly (readonly unknown[] | undefined)[] }} PlacementTopology */
/** @typedef {{ topology: PlacementTopology, geometryRevision: number, rectangles: Float32Array, overlap: "disjoint" | "may-overlap" }} PlacementSnapshot */

export default class PlacementSource {
    /** @type {PlacementTopology} */
    #topology = { revision: 0, facetIds: [] };

    /** @type {PlacementSnapshot} */
    #snapshot = {
        topology: this.#topology,
        geometryRevision: 0,
        rectangles: new Float32Array(),
        overlap: "disjoint",
    };

    /** @type {Set<() => void>} */
    #disposeListeners = new Set();

    #disposed = false;

    /** @returns {PlacementSnapshot} */
    getSnapshot() {
        if (this.#disposed) {
            throw new Error("Cannot read a disposed placement source.");
        }
        return this.#snapshot;
    }

    /**
     * Replaces complete membership and its aligned geometry atomically.
     *
     * @param {readonly (readonly unknown[] | undefined)[]} facetIds
     * @param {Float32Array} rectangles
     * @param {"disjoint" | "may-overlap"} [overlap]
     */
    replaceTopology(facetIds, rectangles, overlap = "disjoint") {
        this.#assertAlive();
        validateRectangles(rectangles, facetIds.length);
        const topology = Object.freeze({
            revision: this.#topology.revision + 1,
            facetIds: Object.freeze(
                facetIds.map((facetId) =>
                    facetId ? Object.freeze(Array.from(facetId)) : undefined
                )
            ),
        });
        this.#topology = topology;
        this.#snapshot = Object.freeze({
            topology,
            geometryRevision: this.#snapshot.geometryRevision + 1,
            rectangles: measurePerformance("placementSourceSnapshot", () => {
                countPerformance(
                    "placementSourceSnapshotBytes",
                    rectangles.byteLength
                );
                return new Float32Array(rectangles);
            }),
            overlap,
        });
    }

    /**
     * Publishes new geometry without changing placement membership.
     *
     * @param {Float32Array} rectangles
     * @param {"disjoint" | "may-overlap"} [overlap]
     */
    replaceGeometry(rectangles, overlap = this.#snapshot.overlap) {
        this.#assertAlive();
        validateRectangles(rectangles, this.#topology.facetIds.length);
        this.#snapshot = Object.freeze({
            topology: this.#topology,
            geometryRevision: this.#snapshot.geometryRevision + 1,
            rectangles: measurePerformance("placementSourceSnapshot", () => {
                countPerformance(
                    "placementSourceSnapshotBytes",
                    rectangles.byteLength
                );
                return new Float32Array(rectangles);
            }),
            overlap,
        });
    }

    /** @param {() => void} listener @returns {() => void} */
    onDispose(listener) {
        this.#assertAlive();
        this.#disposeListeners.add(listener);
        return () => this.#disposeListeners.delete(listener);
    }

    dispose() {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        for (const listener of this.#disposeListeners) {
            listener();
        }
        this.#disposeListeners.clear();
    }

    #assertAlive() {
        if (this.#disposed) {
            throw new Error("Placement source has been disposed.");
        }
    }
}

/**
 * @param {Float32Array} rectangles
 * @param {number} count
 */
function validateRectangles(rectangles, count) {
    if (
        !(rectangles instanceof Float32Array) ||
        rectangles.length !== count * 4
    ) {
        throw new Error(
            "Placement rectangles must contain four values per entry."
        );
    }
    for (let index = 0; index < rectangles.length; index += 4) {
        const x = rectangles[index];
        const y = rectangles[index + 1];
        const width = rectangles[index + 2];
        const height = rectangles[index + 3];
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 0 ||
            height < 0
        ) {
            throw new Error(
                "Placement rectangles must contain finite coordinates and non-negative sizes."
            );
        }
    }
}
