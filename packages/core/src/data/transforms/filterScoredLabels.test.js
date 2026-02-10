import { describe, expect, test, vi } from "vitest";
import FilterScoredLabelsTransform from "./filterScoredLabels.js";

class FakeScaleResolution {
    /** @type {Set<() => void>} */
    #domainListeners = new Set();

    /**
     * @param {string} type
     * @param {() => void} listener
     */
    addEventListener(type, listener) {
        if (type === "domain") {
            this.#domainListeners.add(listener);
        }
    }

    /**
     * @param {string} type
     * @param {() => void} listener
     */
    removeEventListener(type, listener) {
        if (type === "domain") {
            this.#domainListeners.delete(listener);
        }
    }

    emitDomain() {
        for (const listener of this.#domainListeners) {
            listener();
        }
    }

    getDomainListenerCount() {
        return this.#domainListeners.size;
    }

    getScale() {
        return {
            domain: () => [0, 100],
            invert: (
                /** @type {number} */
                value
            ) => value,
        };
    }

    getAxisLength() {
        return 100;
    }
}

class FakeView {
    /** @type {Map<string, Set<(message: { type: string }) => void>>} */
    #broadcastHandlers = new Map();

    /** @type {{ animator: { requestTransition: ReturnType<typeof vi.fn> } }} */
    context = {
        animator: {
            requestTransition: vi.fn(),
        },
    };

    /** @type {FakeScaleResolution} */
    #resolution;

    /**
     * @param {FakeScaleResolution} resolution
     */
    constructor(resolution) {
        this.#resolution = resolution;
    }

    /**
     * @returns {FakeScaleResolution}
     */
    getScaleResolution() {
        return this.#resolution;
    }

    /**
     * @param {string} type
     * @param {(message: { type: string }) => void} handler
     * @returns {() => void}
     */
    _addBroadcastHandler(type, handler) {
        const handlers = this.#broadcastHandlers.get(type) ?? new Set();
        handlers.add(handler);
        this.#broadcastHandlers.set(type, handlers);

        return () => {
            handlers.delete(handler);
        };
    }

    /**
     * @param {string} type
     */
    emit(type) {
        for (const handler of this.#broadcastHandlers.get(type) ?? []) {
            handler({ type });
        }
    }

    /**
     * @param {string} type
     */
    getBroadcastHandlerCount(type) {
        return this.#broadcastHandlers.get(type)?.size ?? 0;
    }
}

describe("FilterScoredLabelsTransform", () => {
    test("disposes domain and layout listeners", () => {
        const resolution = new FakeScaleResolution();
        const view = new FakeView(resolution);

        // Non-obvious: we only need listener wiring, not actual filtering data.
        const transform = new FilterScoredLabelsTransform(
            /** @type {any} */ ({
                type: "filterScoredLabels",
                channel: "x",
                pos: "pos",
                score: "score",
                width: "width",
            }),
            /** @type {any} */ (view)
        );

        expect(resolution.getDomainListenerCount()).toBe(1);
        expect(view.getBroadcastHandlerCount("layoutComputed")).toBe(1);

        resolution.emitDomain();
        view.emit("layoutComputed");
        expect(view.context.animator.requestTransition).toHaveBeenCalledTimes(
            2
        );

        transform.dispose();

        expect(resolution.getDomainListenerCount()).toBe(0);
        expect(view.getBroadcastHandlerCount("layoutComputed")).toBe(0);

        resolution.emitDomain();
        view.emit("layoutComputed");
        expect(view.context.animator.requestTransition).toHaveBeenCalledTimes(
            2
        );
    });
});
