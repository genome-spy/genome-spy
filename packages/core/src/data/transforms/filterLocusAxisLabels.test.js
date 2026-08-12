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

    paramRuntime = {
        setValue: vi.fn(),
    };

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
            fadeDistanceParam: "chromLabelFadeDistance",
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

/**
 * @param {number} value
 * @param {number} chromLabelWidth
 * @param {string} [chromLabel]
 */
function tick(value, chromLabelWidth, chromLabel = "long_contig_name") {
    return {
        value,
        label: String(value),
        chromLabel,
        labelWidth: 20,
        chromLabelWidth,
    };
}

describe("FilterLocusAxisLabelsTransform", () => {
    test("publishes the filtered batch synchronously on completion", () => {
        const { collector, transform, view } = createFixture();

        transform.handle(tick(350, 120));
        transform.complete();

        expect(collector.completed).toBe(true);
        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            350,
        ]);
        expect(view.transitions).toHaveLength(0);
    });

    test("defers the initial batch until axis length is available", () => {
        const { collector, resolution, transform, view } = createFixture();
        resolution.axisLength = 0;

        transform.handle(tick(350, 120));
        transform.complete();

        expect(collector.completed).toBe(true);
        expect([...collector.getData()]).toHaveLength(0);
        expect(view.transitions).toHaveLength(1);

        resolution.axisLength = 500;
        view.flushTransitions();
        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            350,
        ]);
    });

    test("preserves published output while axis length is unavailable", () => {
        const { collector, resolution, transform, view } = createFixture();
        const ticks = [tick(350, 120)];
        propagate(transform, view, ticks);
        const resetSpy = vi.spyOn(collector, "reset");
        const completeSpy = vi.spyOn(collector, "complete");

        resolution.axisLength = 0;
        transform.reset();
        for (const datum of ticks) {
            transform.handle(datum);
        }
        transform.complete();

        expect(resetSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        expect([...collector.getData()]).toEqual(ticks);

        resolution.axisLength = 500;
        view.flushTransitions();
        expect(resetSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
    });

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

    test("does not propagate when the output value set is unchanged", () => {
        const { collector, resolution, transform, view } = createFixture();
        const ticks = [tick(350, 120), tick(450, 120)];
        propagate(transform, view, ticks);

        const resetSpy = vi.spyOn(collector, "reset");
        const handleSpy = vi.spyOn(collector, "handle");
        const completeSpy = vi.spyOn(collector, "complete");

        resolution.emitDomain();
        view.emit("layoutComputed");
        view.flushTransitions();

        transform.reset();
        propagate(
            transform,
            view,
            ticks.toReversed().map((datum) => ({ ...datum }))
        );

        expect(resetSpy).not.toHaveBeenCalled();
        expect(handleSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        expect([...collector.getData()]).toEqual(ticks);
    });

    test("propagates when the output value set changes", () => {
        const { collector, resolution, transform, view } = createFixture();
        propagate(transform, view, [tick(300, 160)]);
        const resetSpy = vi.spyOn(collector, "reset");
        const completeSpy = vi.spyOn(collector, "complete");

        resolution.axisLength = 1000;
        view.emit("layoutComputed");
        view.flushTransitions();

        expect(resetSpy).toHaveBeenCalledOnce();
        expect(completeSpy).toHaveBeenCalledOnce();
        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            300,
        ]);
    });

    test("publishes the leading label extent without re-entering", () => {
        const { transform, view } = createFixture();
        const filterSpy = vi.spyOn(transform, "filterAndPropagate");

        propagate(transform, view, [tick(350, 120)]);

        expect(view.paramRuntime.setValue).toHaveBeenCalledOnce();
        expect(view.paramRuntime.setValue).toHaveBeenCalledWith(
            "chromLabelFadeDistance",
            128
        );
        expect(filterSpy).toHaveBeenCalledOnce();
    });

    test("updates the fade distance when the axis is resized", () => {
        const { resolution, transform, view } = createFixture();
        resolution.axisLength = 80;
        propagate(transform, view, [tick(350, 120)]);
        expect(view.paramRuntime.setValue).toHaveBeenLastCalledWith(
            "chromLabelFadeDistance",
            84
        );

        resolution.axisLength = 500;
        view.emit("layoutComputed");
        view.flushTransitions();
        expect(view.paramRuntime.setValue).toHaveBeenLastCalledWith(
            "chromLabelFadeDistance",
            128
        );
    });

    test("updates the fade distance when panning to a longer name", () => {
        const { resolution, transform, view } = createFixture({
            contigs: [
                { name: "chr1", size: 500 },
                { name: "long_contig_name", size: 500 },
            ],
        });
        resolution.domain = [0, 500];
        propagate(transform, view, [tick(200, 30, "chr1")]);
        expect(view.paramRuntime.setValue).toHaveBeenLastCalledWith(
            "chromLabelFadeDistance",
            38
        );

        transform.reset();
        resolution.domain = [500, 1000];
        propagate(transform, view, [tick(700, 120)]);
        expect(view.paramRuntime.setValue).toHaveBeenLastCalledWith(
            "chromLabelFadeDistance",
            128
        );
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
    test("uses the whole visible chromosome interval when squeezed", () => {
        expect(getRangedLabelBounds(-20, 80, 120, 4, "left", 500)).toEqual([
            0, 80,
        ]);
    });

    test("flushes a partially visible leading chromosome label", () => {
        expect(getRangedLabelBounds(-200, 300, 120, 4, "left", 500)).toEqual([
            4, 124,
        ]);
    });
});
