import { describe, expect, test, vi } from "vitest";

import Collector from "../collector.js";
import Genome from "../../genome/genome.js";
import AxisLabelLayoutTransform, {
    getAxisLabelBounds,
    getFlushedLabelOffset,
    getRangedLabelBounds,
} from "./axisLabelLayout.js";

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
        scale.type = "linear";
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
 * @param {"left" | "center" | "right"} [options.chromLabelAlign]
 * @param {boolean} [options.chromLabels]
 * @param {false | "auto" | "parity" | "greedy"} [options.labelOverlap]
 * @param {false | number} [options.labelFlush]
 * @param {number} [options.labelFlushOffset]
 * @param {"x" | "y"} [options.channel]
 * @param {"left" | "center" | "right"} [options.labelAlign]
 * @param {"alphabetic" | "baseline" | "top" | "middle" | "bottom"} [options.labelBaseline]
 */
function createFixture({
    contigs = [{ name: "long_contig_name", size: 1000 }],
    chromLabelAlign = "left",
    chromLabels = true,
    labelOverlap = false,
    labelFlush = false,
    labelFlushOffset = 0,
    channel = "x",
    labelAlign = "center",
    labelBaseline = "top",
} = {}) {
    const genome = new Genome({ name: "custom", contigs });
    const resolution = new FakeScaleResolution(genome);
    const view = new FakeView(resolution);
    const transform = new AxisLabelLayoutTransform(
        {
            type: "axisLabelLayout",
            channel,
            labelWidth: "labelWidth",
            labelFontSize: 10,
            labelAngle: 0,
            labelAlign,
            labelBaseline,
            labelFlush,
            labelFlushOffset,
            labelOffset: "labelOffset",
            labelOverlap,
            labelSeparation: 0,
            labelVisible: "labelVisible",
            ...(chromLabels
                ? {
                      chromLabelWidth: "chromLabelWidth",
                      chromLabelAlign,
                      chromLabelPadding: 4,
                      chromLabelSpacing: 5,
                  }
                : {}),
        },
        /** @type {any} */ (view)
    );
    const collector = new Collector();
    transform.addChild(collector);

    return { collector, resolution, transform, view };
}

/**
 * @param {AxisLabelLayoutTransform} transform
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
 * @param {number} [labelWidth]
 */
function tick(
    value,
    chromLabelWidth,
    chromLabel = "long_contig_name",
    labelWidth = 20
) {
    return {
        value,
        label: String(value),
        chromLabel,
        labelWidth,
        chromLabelWidth,
    };
}

describe("AxisLabelLayoutTransform", () => {
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

    test("keeps spacing between chromosome and numeric labels", () => {
        const { collector, transform, view } = createFixture();
        propagate(transform, view, [tick(228, 100), tick(238, 100)]);

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            238,
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

    test("reacts when subtle zoom changes label visibility but not tick values", () => {
        const { collector, resolution, transform, view } = createFixture({
            chromLabels: false,
            labelOverlap: "parity",
        });
        resolution.axisLength = 100;
        const ticks = [200, 500, 800].map((value) =>
            tick(value, 0, undefined, 20)
        );
        propagate(transform, view, ticks);

        expect(
            [...collector.getData()].map((datum) => datum.labelVisible)
        ).toEqual([true, true, true]);
        const resetSpy = vi.spyOn(collector, "reset");

        // No new tick batch is propagated; only the scale domain changes.
        resolution.domain = [0, 2000];
        resolution.emitDomain();

        expect(resetSpy).toHaveBeenCalledOnce();
        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            200, 500, 800,
        ]);
        expect(
            [...collector.getData()].map((datum) => datum.labelVisible)
        ).toEqual([true, false, true]);
    });

    test("flushes endpoint labels without changing tick values", () => {
        const { collector, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
        });
        const ticks = [0, 500, 1000].map((value) =>
            tick(value, 0, undefined, 40)
        );
        propagate(transform, view, ticks);

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            0, 500, 1000,
        ]);
        expect(
            [...collector.getData()].map((datum) => datum.labelOffset)
        ).toEqual([20, 0, -20]);
    });

    test("flushes vertical labels using their main-axis bounds", () => {
        const { collector, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
            channel: "y",
            labelAlign: "right",
            labelBaseline: "middle",
        });
        propagate(transform, view, [
            tick(0, 0, undefined, 40),
            tick(1000, 0, undefined, 40),
        ]);

        expect(
            [...collector.getData()].map((datum) => datum.labelOffset)
        ).toEqual([-5, 5]);
    });

    test("applies the flush threshold and outward offset", () => {
        const { collector, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
            labelFlushOffset: 2,
        });
        propagate(transform, view, [
            tick(1, 0, undefined, 40),
            tick(997, 0, undefined, 40),
        ]);

        expect(
            [...collector.getData()].map((datum) => datum.labelOffset)
        ).toEqual([18, 0]);
    });

    test("flushes the correct endpoints on a reversed scale", () => {
        const { collector, resolution, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
        });
        resolution.domain = [1000, 0];
        propagate(transform, view, [
            tick(1000, 0, undefined, 40),
            tick(0, 0, undefined, 40),
        ]);

        expect(
            [...collector.getData()].map((datum) => datum.labelOffset)
        ).toEqual([20, -20]);
    });

    test("propagates when only the flush assignment changes", () => {
        const { collector, resolution, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
        });
        const ticks = [tick(0, 0, undefined, 40)];
        propagate(transform, view, ticks);
        const resetSpy = vi.spyOn(collector, "reset");

        resolution.domain = [-100, 900];
        resolution.emitDomain();

        expect(resetSpy).toHaveBeenCalledOnce();
        expect([...collector.getData()][0].labelOffset).toBe(0);
    });

    test("does not propagate when flush assignments stay unchanged", () => {
        const { collector, resolution, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
        });
        propagate(transform, view, [tick(0, 0, undefined, 40)]);
        const resetSpy = vi.spyOn(collector, "reset");

        resolution.emitDomain();

        expect(resetSpy).not.toHaveBeenCalled();
        expect([...collector.getData()][0].labelOffset).toBe(20);
    });

    test("uses flushed bounds for overlap removal", () => {
        const { collector, resolution, transform, view } = createFixture({
            chromLabels: false,
            labelFlush: 1,
            labelOverlap: "parity",
        });
        resolution.domain = [0, 100];
        resolution.axisLength = 100;
        propagate(
            transform,
            view,
            [0, 50, 100].map((value) => tick(value, 0, undefined, 40))
        );

        expect(
            [...collector.getData()].map((datum) => datum.labelVisible)
        ).toEqual([true, false, true]);
    });

    test("removes chromosome conflicts before ordinary overlap reduction", () => {
        const { collector, transform, view } = createFixture({
            labelOverlap: "parity",
        });
        const ticks = [
            ...[50, 150, 230].map((value) => tick(value, 120)),
            ...[350, 370, 390].map((value) => tick(value, 120, undefined, 30)),
        ];
        propagate(transform, view, ticks);

        expect([...collector.getData()].map((datum) => datum.value)).toEqual([
            350, 370, 390,
        ]);
        expect(
            [...collector.getData()].map((datum) => datum.labelVisible)
        ).toEqual([true, false, true]);
    });

    test.each([
        ["linear", [true, false, true, false, true]],
        ["log", [true, true, false, true, false]],
        ["symlog", [true, true, false, true, false]],
    ])("resolves the auto method for %s scales", (scaleType, expected) => {
        const { collector, resolution, transform, view } = createFixture({
            chromLabels: false,
            labelOverlap: "auto",
        });
        resolution.domain = [0, 100];
        resolution.axisLength = 100;
        resolution.scale.type = scaleType;
        propagate(transform, view, [
            tick(0, 0, undefined, 20),
            tick(15, 0, undefined, 10),
            tick(25, 0, undefined, 20),
            tick(40, 0, undefined, 10),
            tick(50, 0, undefined, 20),
        ]);

        expect(
            [...collector.getData()].map((datum) => datum.labelVisible)
        ).toEqual(expected);
    });

    test("rejects overlap removal for non-axis-aligned labels", () => {
        expect(
            () =>
                new AxisLabelLayoutTransform(
                    {
                        type: "axisLabelLayout",
                        channel: "x",
                        labelWidth: "labelWidth",
                        labelFontSize: 10,
                        labelAngle: 45,
                        labelAlign: "center",
                        labelBaseline: "top",
                        labelFlush: false,
                        labelFlushOffset: 0,
                        labelOffset: "labelOffset",
                        labelOverlap: "parity",
                        labelSeparation: 0,
                        labelVisible: "labelVisible",
                    },
                    /** @type {any} */ (
                        new FakeView(
                            new FakeScaleResolution(
                                new Genome({
                                    name: "custom",
                                    contigs: [{ name: "chr1", size: 1000 }],
                                })
                            )
                        )
                    )
                )
        ).toThrow(/axis-aligned/);
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

describe("getAxisLabelBounds", () => {
    test("uses measured width along a horizontal unrotated axis", () => {
        expect(
            getAxisLabelBounds(100, 40, 10, 0, "x", "center", "top")
        ).toEqual([80, 120]);
    });

    test("uses measured width along a vertical quarter-turned axis", () => {
        expect(
            getAxisLabelBounds(100, 40, 10, 90, "y", "left", "middle")
        ).toEqual([60, 100]);
    });
});

describe("getFlushedLabelOffset", () => {
    test("uses a zero threshold for exact endpoints", () => {
        expect(getFlushedLabelOffset(0, [-20, 20], 100, 0, 0)).toBe(20);
        expect(getFlushedLabelOffset(0.1, [-19.9, 20.1], 100, 0, 0)).toBe(0);
    });

    test("moves endpoint labels outward", () => {
        expect(getFlushedLabelOffset(0, [-20, 20], 100, 1, 2)).toBe(18);
        expect(getFlushedLabelOffset(100, [80, 120], 100, 1, 2)).toBe(-18);
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
