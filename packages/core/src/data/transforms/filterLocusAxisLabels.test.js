import { describe, expect, test, vi } from "vitest";

import Collector from "../collector.js";
import Genome from "../../genome/genome.js";
import FilterLocusAxisLabelsTransform, {
    getRangedLabelBounds,
} from "./filterLocusAxisLabels.js";

class FakeScaleResolution {
    /** @type {Set<() => void>} */
    domainListeners = new Set();

    /** @type {number[]} */
    domain = [0, 1000];

    axisLength = 500;

    /** @param {Genome} genome */
    constructor(genome) {
        this.genome = genome;
        const scale = (/** @type {number} */ value) =>
            (value - this.domain[0]) / (this.domain[1] - this.domain[0]);
        scale.genome = () => this.genome;
        this.scale = scale;
    }

    /** @param {string} type @param {() => void} listener */
    addEventListener(type, listener) {
        if (type == "domain") {
            this.domainListeners.add(listener);
        }
    }

    /** @param {string} type @param {() => void} listener */
    removeEventListener(type, listener) {
        if (type == "domain") {
            this.domainListeners.delete(listener);
        }
    }

    emitDomain() {
        for (const listener of this.domainListeners) {
            listener();
        }
    }

    getScale() {
        return this.scale;
    }

    getAxisLength() {
        return this.axisLength;
    }
}

class FakeView {
    /** @type {Map<string, Set<() => void>>} */
    broadcastHandlers = new Map();

    /** @type {(() => void)[]} */
    transitions = [];

    context = {
        animator: {
            requestTransition: (/** @type {() => void} */ callback) => {
                this.transitions.push(callback);
            },
        },
    };

    /** @param {FakeScaleResolution} resolution */
    constructor(resolution) {
        this.resolution = resolution;
    }

    getScaleResolution() {
        return this.resolution;
    }

    /** @param {string} type @param {() => void} handler */
    _addBroadcastHandler(type, handler) {
        const handlers = this.broadcastHandlers.get(type) ?? new Set();
        handlers.add(handler);
        this.broadcastHandlers.set(type, handlers);
        return () => handlers.delete(handler);
    }

    /** @param {string} type */
    emit(type) {
        for (const handler of this.broadcastHandlers.get(type) ?? []) {
            handler();
        }
    }

    flushTransitions() {
        for (const callback of this.transitions.splice(0)) {
            callback();
        }
    }
}

/**
 * @param {object} [options]
 * @param {{ name: string, size: number }[]} [options.contigs]
 */
function createFixture({
    contigs = [{ name: "long_contig_name", size: 1000 }],
} = {}) {
    const genome = new Genome({ name: "custom", contigs });
    const resolution = new FakeScaleResolution(genome);
    const view = new FakeView(resolution);
    const transform = new FilterLocusAxisLabelsTransform(
        {
            type: "filterLocusAxisLabels",
            channel: "x",
            labelWidth: "labelWidth",
            chromLabelWidth: "chromLabelWidth",
            labelAlign: "center",
            chromLabelAlign: "left",
            chromLabelPadding: 4,
        },
        /** @type {any} */ (view)
    );
    const collector = new Collector();
    transform.addChild(collector);

    return { collector, resolution, transform, view };
}

/**
 * @param {FilterLocusAxisLabelsTransform} transform
 * @param {FakeView} view
 * @param {any[]} data
 */
function propagate(transform, view, data) {
    for (const datum of data) {
        transform.handle(datum);
    }
    transform.complete();
    view.flushTransitions();
}

/** @param {number} value @param {number} chromLabelWidth */
function tick(value, chromLabelWidth) {
    return {
        value,
        label: String(value),
        chromLabel: "long_contig_name",
        labelWidth: 20,
        chromLabelWidth,
    };
}

describe("FilterLocusAxisLabelsTransform", () => {
    test("a long chromosome label culls several numeric labels", () => {
        const { collector, transform, view } = createFixture();
        propagate(
            transform,
            view,
            [50, 150, 230, 350].map((value) => tick(value, 120))
        );

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            350,
        ]);
    });

    test("a short chromosome label preserves normally spaced ticks", () => {
        const { collector, transform, view } = createFixture();
        propagate(
            transform,
            view,
            [200, 400, 600, 800].map((value) => tick(value, 30))
        );

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            200, 400, 600, 800,
        ]);
    });

    test("handles internal chromosome boundaries and reversed scales", () => {
        const { collector, resolution, transform, view } = createFixture({
            contigs: [
                { name: "chr1", size: 500 },
                { name: "long_contig_name", size: 500 },
            ],
        });
        resolution.domain = [1000, 0];
        propagate(transform, view, [tick(950, 100), tick(700, 100)]);

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            700,
        ]);
    });

    test("recomputes retained rows after domain and layout changes", () => {
        const { collector, resolution, transform, view } = createFixture();
        const filterSpy = vi.spyOn(transform, "filterAndPropagate");
        propagate(transform, view, [tick(300, 160)]);
        expect([...collector.getData()]).toHaveLength(0);

        resolution.axisLength = 1000;
        view.emit("layoutComputed");
        view.flushTransitions();
        expect([...collector.getData()]).toHaveLength(1);

        resolution.domain = [0, 2000];
        resolution.emitDomain();
        expect([...collector.getData()]).toHaveLength(0);
        expect(filterSpy).toHaveBeenCalledTimes(3);
    });

    test("disposes its domain and layout listeners", () => {
        const { resolution, transform, view } = createFixture();
        expect(resolution.domainListeners.size).toBe(1);
        expect(view.broadcastHandlers.get("layoutComputed").size).toBe(1);

        transform.dispose();

        expect(resolution.domainListeners.size).toBe(0);
        expect(view.broadcastHandlers.get("layoutComputed").size).toBe(0);
    });
});

describe("getRangedLabelBounds", () => {
    test("flushes a partially visible leading chromosome label", () => {
        expect(getRangedLabelBounds(-200, 300, 120, 4, "left", 500)).toEqual([
            4, 124,
        ]);
    });
});
