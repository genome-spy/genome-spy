import { describe, expect, test, vi } from "vitest";
import Rectangle from "../../view/layout/rectangle.js";
import { createAndInitialize, renderToLayout } from "../../view/testUtils.js";
import UnitView from "../../view/unitView.js";
import Collector from "../collector.js";
import Displace1DTransform from "./displace1d.js";

class FakeScaleResolution {
    /** @type {Set<() => void>} */
    #domainListeners = new Set();

    factor = 1;
    axisLength = 100;

    /**
     * @param {string} type
     * @param {() => void} listener
     */
    addEventListener(type, listener) {
        if (type == "domain") {
            this.#domainListeners.add(listener);
        }
    }

    /**
     * @param {string} type
     * @param {() => void} listener
     */
    removeEventListener(type, listener) {
        if (type == "domain") {
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
        return (/** @type {number} */ value) => value * this.factor;
    }

    getAxisLength() {
        return this.axisLength;
    }
}

class FakeView {
    /** @type {Map<string, Set<(message: { type: string }) => void>>} */
    #broadcastHandlers = new Map();

    /** @type {(() => void)[]} */
    scheduledCallbacks = [];

    context = {
        animator: {
            requestTransition: vi.fn((/** @type {() => void} */ callback) => {
                this.scheduledCallbacks.push(callback);
            }),
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

    getScaleResolution() {
        return this.#resolution;
    }

    /**
     * @param {string} type
     * @param {(message: { type: string }) => void} handler
     */
    _addBroadcastHandler(type, handler) {
        const handlers = this.#broadcastHandlers.get(type) ?? new Set();
        handlers.add(handler);
        this.#broadcastHandlers.set(type, handlers);
        return () => handlers.delete(handler);
    }

    /**
     * @param {string} type
     */
    emit(type) {
        for (const handler of this.#broadcastHandlers.get(type) ?? []) {
            handler({ type });
        }
    }

    getLayoutListenerCount() {
        return this.#broadcastHandlers.get("layoutComputed")?.size ?? 0;
    }

    runScheduledCallback() {
        this.scheduledCallbacks.shift()();
    }
}

/**
 * @param {{ pos: number, length?: number }[]} data
 * @param {number | string} length
 */
function createFlow(data, length) {
    const resolution = new FakeScaleResolution();
    const view = new FakeView(resolution);
    const transform = new Displace1DTransform(
        {
            type: "displace1d",
            pos: "pos",
            length,
            as: "offset",
        },
        /** @type {any} */ (view)
    );
    const collector = new Collector();
    transform.addChild(collector);

    for (const datum of data) {
        transform.handle(datum);
    }
    transform.complete();

    return { collector, resolution, transform, view };
}

describe("Displace1DTransform", () => {
    test("uses x and displacement as grammar defaults", () => {
        const resolution = new FakeScaleResolution();
        const view = new FakeView(resolution);
        const transform = new Displace1DTransform(
            { type: "displace1d", pos: "pos", length: 10 },
            /** @type {any} */ (view)
        );
        const collector = new Collector();
        transform.addChild(collector);
        transform.handle({ pos: 0 });
        transform.complete();

        expect(transform.channel).toBe("x");
        expect([...collector.getData()]).toEqual([{ pos: 0, displacement: 0 }]);
    });

    test("uses the initialized view scale without affecting its domain", async () => {
        /** @type {import("../../spec/view.js").UnitSpec} */
        const spec = {
            width: 200,
            height: 100,
            data: { values: [{ pos: 10 }, { pos: 11 }] },
            transform: [
                {
                    type: "displace1d",
                    pos: "pos",
                    length: 20,
                    as: "offset",
                },
            ],
            mark: "point",
            encoding: {
                x: {
                    field: "pos",
                    type: "quantitative",
                    scale: { domain: [0, 100], zoom: true },
                },
                xOffset: {
                    field: "offset",
                    type: "quantitative",
                    scale: null,
                },
            },
        };
        const view = await createAndInitialize(spec, UnitView);
        renderToLayout(view, Rectangle.create(0, 0, 200, 100));

        /** @type {Displace1DTransform | undefined} */
        let transform;
        view.flowHandle.dataSource.visit((node) => {
            if (node instanceof Displace1DTransform) {
                transform = node;
            }
        });
        transform._updateAndPropagate();

        const resolution = view.getScaleResolution("x");
        expect(resolution.getScale().domain()).toEqual([0, 100]);
        expect(
            [...view.flowHandle.collector.getData()].map(
                (datum) => datum.offset
            )
        ).not.toEqual([0, 0]);

        await resolution.zoomTo([0, 10], false);
        expect(
            [...view.flowHandle.collector.getData()].map(
                (datum) => datum.offset
            )
        ).toEqual([0, 0]);
    });

    test("emits reusable clones in input order and updates offsets on zoom", () => {
        const input = [{ pos: 0.1 }, { pos: 0 }];
        const { collector, resolution, view } = createFlow(input, 20);

        // The initial pass establishes the primary domain with zero offsets.
        expect([...collector.getData()]).toEqual([
            { pos: 0.1, offset: 0 },
            { pos: 0, offset: 0 },
        ]);

        view.runScheduledCallback();
        const firstPlacement = [...collector.getData()];
        expect(firstPlacement.map((datum) => datum.offset)).toEqual([5, -5]);
        expect(firstPlacement[0]).not.toBe(input[0]);

        resolution.factor = 3;
        resolution.emitDomain();
        const zoomedPlacement = [...collector.getData()];
        expect(zoomedPlacement.map((datum) => datum.offset)).toEqual([0, 0]);
        expect(zoomedPlacement[0]).toBe(firstPlacement[0]);
        expect(zoomedPlacement[1]).toBe(firstPlacement[1]);
    });

    test("reads collision lengths from a field", () => {
        const { collector, view } = createFlow(
            [
                { pos: 0, length: 10 },
                { pos: 0.05, length: 20 },
            ],
            "length"
        );

        view.runScheduledCallback();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -5, 5,
        ]);
    });

    test("preserves tie order with a reversed primary scale", () => {
        const { collector, resolution, view } = createFlow(
            [{ pos: 0 }, { pos: 0 }, { pos: 0.2 }],
            10
        );
        resolution.factor = -1;

        view.runScheduledCallback();
        const data = [...collector.getData()];
        expect(data.map((datum) => datum.offset)).toEqual([-5, 5, 0]);
    });

    test("keeps coincident items displaced when zooming", () => {
        const { collector, resolution, view } = createFlow(
            [{ pos: 0 }, { pos: 0 }],
            20
        );
        view.runScheduledCallback();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -10, 10,
        ]);

        resolution.factor = 100;
        resolution.emitDomain();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -10, 10,
        ]);
    });

    test("uses the current axis length after layout changes", () => {
        const { collector, resolution, view } = createFlow(
            [{ pos: 0 }, { pos: 0.1 }],
            20
        );
        view.runScheduledCallback();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            -5, 5,
        ]);

        resolution.axisLength = 300;
        view.emit("layoutComputed");
        view.runScheduledCallback();
        expect([...collector.getData()].map((datum) => datum.offset)).toEqual([
            0, 0,
        ]);
    });

    test("recomputes after layout and disposes reactive listeners", () => {
        const { resolution, transform, view } = createFlow([], 10);
        expect(resolution.getDomainListenerCount()).toBe(1);
        expect(view.getLayoutListenerCount()).toBe(1);

        view.emit("layoutComputed");
        expect(view.scheduledCallbacks).toHaveLength(2);

        transform.dispose();
        expect(resolution.getDomainListenerCount()).toBe(0);
        expect(view.getLayoutListenerCount()).toBe(0);
    });
});
