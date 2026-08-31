import { describe, expect, test, vi } from "vitest";
import Collector from "../collector.js";
import FlowNode from "../flowNode.js";
import TransitionTransform from "./transition.js";
import createTransform from "./transformFactory.js";

class TestAnimator {
    transitionsEnabled = true;

    /** @type {((timestamp: number) => void)[]} */
    transitions = [];

    /** @param {(timestamp: number) => void} callback */
    requestTransition(callback) {
        this.cancelTransition(callback);
        this.transitions.push(callback);
    }

    /** @param {(timestamp: number) => void} callback */
    cancelTransition(callback) {
        const index = this.transitions.indexOf(callback);
        if (index >= 0) {
            this.transitions.splice(index, 1);
        }
    }

    /** @param {number} timestamp */
    frame(timestamp) {
        const transitions = this.transitions;
        this.transitions = [];
        for (const transition of transitions) {
            transition(timestamp);
        }
    }
}

/** @param {Partial<import("../../spec/transform.js").TransitionParams>} [params] */
function setup(params = {}) {
    const animator = new TestAnimator();
    const provider = /** @type {any} */ ({ context: { animator } });
    const transform = new TransitionTransform(
        {
            type: "transition",
            key: "id",
            fields: ["x", "y"],
            halfLife: 80,
            epsilon: 0.01,
            ...params,
        },
        provider
    );
    const collector = new Collector();
    transform.addChild(collector);
    return { animator, transform, collector };
}

/**
 * @param {TransitionTransform} transform
 * @param {import("../flowNode.js").Datum[]} data
 */
function update(transform, data) {
    transform.reset();
    for (const datum of data) {
        transform.handle(datum);
    }
    transform.complete();
}

describe("transition", () => {
    test("snaps the initial batch and interpolates replacement rows by key", () => {
        const { animator, transform, collector } = setup();
        update(transform, [{ id: "a", x: 0, y: 10 }]);
        expect(collector.getData()).toEqual([{ id: "a", x: 0, y: 10 }]);

        update(transform, [{ id: "a", x: 8, y: 2 }]);
        expect(collector.getData()).toEqual([{ id: "a", x: 0, y: 10 }]);

        animator.frame(0);
        animator.frame(80);
        expect(Array.from(collector.getData())[0]).toEqual({
            id: "a",
            x: 4,
            y: 6,
        });
    });

    test("writes separate output fields without replacing target values", () => {
        const { animator, transform, collector } = setup({
            fields: ["targetX", "targetY"],
            as: ["x", "y"],
        });
        update(transform, [{ id: 1, targetX: 2, targetY: 4 }]);
        update(transform, [{ id: 1, targetX: 10, targetY: 12 }]);
        animator.frame(0);
        animator.frame(80);

        expect(Array.from(collector.getData())[0]).toEqual({
            id: 1,
            targetX: 10,
            targetY: 12,
            x: 6,
            y: 8,
        });
    });

    test("waits for a quiet target and equal updates do not restart the delay", () => {
        const { animator, transform, collector } = setup({
            fields: ["x"],
            halfLife: 100,
            targetDelay: 100,
        });
        const observer = vi.fn();
        collector.observe(observer);
        update(transform, [{ id: "a", x: 0 }]);
        update(transform, [{ id: "a", x: 8 }]);

        animator.frame(0);
        animator.frame(50);
        expect(Array.from(collector.getData())[0].x).toBe(0);
        expect(observer).toHaveBeenCalledTimes(2);

        update(transform, [{ id: "a", x: 8 }]);
        animator.frame(100);
        expect(Array.from(collector.getData())[0].x).toBeGreaterThan(0);
        expect(observer).toHaveBeenCalledTimes(4);
    });

    test("restarts the quiet period for a new target and promotes the latest", () => {
        const { animator, transform, collector } = setup({
            fields: ["x"],
            halfLife: 100,
            targetDelay: 100,
        });
        update(transform, [{ id: "a", x: 0 }]);
        update(transform, [{ id: "a", x: 8 }]);
        animator.frame(0);
        animator.frame(60);

        update(transform, [{ id: "a", x: 16 }]);
        animator.frame(100);
        animator.frame(160);
        expect(Array.from(collector.getData())[0].x).toBe(0);

        animator.frame(200);
        const x = Array.from(collector.getData())[0].x;
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(16);

        animator.frame(1400);
        expect(Array.from(collector.getData())[0].x).toBe(16);
    });

    test("snaps new keys and forgets removed keys", () => {
        const { transform, collector } = setup();
        update(transform, [
            { id: 1, x: 0, y: 0 },
            { id: 2, x: 10, y: 10 },
        ]);
        update(transform, [
            { id: 2, x: 20, y: 20 },
            { id: 3, x: 30, y: 30 },
        ]);
        expect(collector.getData()).toEqual([
            { id: 2, x: 10, y: 10 },
            { id: 3, x: 30, y: 30 },
        ]);

        update(transform, [{ id: 1, x: 40, y: 40 }]);
        expect(collector.getData()).toEqual([{ id: 1, x: 40, y: 40 }]);
    });

    test("snaps exactly when every field reaches epsilon", () => {
        const { animator, transform, collector } = setup({ epsilon: 1 });
        update(transform, [{ id: "a", x: 0, y: 0 }]);
        update(transform, [{ id: "a", x: 8, y: 4 }]);
        animator.frame(0);
        animator.frame(320);

        expect(collector.getData()).toEqual([{ id: "a", x: 8, y: 4 }]);
        expect(animator.transitions).toHaveLength(0);
    });

    test("snaps updates when transitions are disabled", () => {
        const { animator, transform, collector } = setup();
        update(transform, [{ id: "a", x: 0, y: 0 }]);
        animator.transitionsEnabled = false;
        update(transform, [{ id: "a", x: 8, y: 4 }]);

        expect(collector.getData()).toEqual([{ id: "a", x: 8, y: 4 }]);
        expect(animator.transitions).toHaveLength(0);
    });

    test("snaps updates before the first render", () => {
        const animator = new TestAnimator();
        const provider = /** @type {any} */ ({
            context: { animator },
            hasRendered: () => false,
        });
        const transform = new TransitionTransform(
            { type: "transition", key: "id", fields: ["x"] },
            provider
        );
        const collector = new Collector();
        transform.addChild(collector);
        update(transform, [{ id: "a", x: 0 }]);
        update(transform, [{ id: "a", x: 8 }]);

        expect(Array.from(collector.getData())).toEqual([{ id: "a", x: 8 }]);
        expect(animator.transitions).toHaveLength(0);
    });

    test("replays downstream once per animation frame", () => {
        const { animator, transform, collector } = setup();
        const observer = vi.fn();
        collector.observe(observer);
        update(transform, [{ id: "a", x: 0, y: 0 }]);
        update(transform, [{ id: "a", x: 8, y: 4 }]);
        expect(observer).toHaveBeenCalledTimes(2);

        animator.frame(0);
        expect(observer).toHaveBeenCalledTimes(3);
    });

    test("preserves facet batch boundaries during animation", () => {
        const { animator, transform } = setup();
        transform.removeChild(transform.children[0]);
        const recorder = new BatchRecorder();
        transform.addChild(recorder);

        propagateFacets(transform, 0);
        recorder.events = [];
        propagateFacets(transform, 8);
        recorder.events = [];
        animator.frame(0);

        expect(recorder.events).toEqual([
            "reset",
            "batch:a",
            "row:1",
            "batch:b",
            "row:2",
            "complete",
        ]);
    });

    test("cancels a pending animation when disposed", () => {
        const { animator, transform } = setup();
        update(transform, [{ id: "a", x: 0, y: 0 }]);
        update(transform, [{ id: "a", x: 8, y: 4 }]);
        expect(animator.transitions).toHaveLength(1);

        transform.dispose();
        expect(animator.transitions).toHaveLength(0);
    });

    test("validates parameters, keys, targets, and animator availability", () => {
        expect(() => setup({ fields: [] })).toThrow("transition fields");
        expect(() => setup({ fields: ["x"], as: ["id"] })).toThrow(
            "preserve the key"
        );
        expect(() => setup({ halfLife: 0 })).toThrow("halfLife");
        expect(() => setup({ epsilon: -1 })).toThrow("epsilon");
        expect(() => setup({ targetDelay: -1 })).toThrow("targetDelay");
        expect(
            () =>
                new TransitionTransform(
                    { type: "transition", key: "id", fields: ["x"] },
                    /** @type {any} */ ({})
                )
        ).toThrow("requires an animator");

        const { transform } = setup();
        expect(() => update(transform, [{ id: {}, x: 0, y: 0 }])).toThrow(
            "keys must"
        );
        expect(() =>
            update(transform, [{ id: "a", x: Infinity, y: 0 }])
        ).toThrow("targets must");
        expect(() =>
            update(transform, [
                { id: "a", x: 0, y: 0 },
                { id: "a", x: 1, y: 1 },
            ])
        ).toThrow("key must be unique");
    });

    test("is registered in the transform factory", () => {
        const animator = new TestAnimator();
        const transform = createTransform(
            /** @type {import("../../spec/transform.js").TransitionParams} */ ({
                type: "transition",
                key: "id",
                fields: ["x"],
            }),
            /** @type {any} */ ({ context: { animator } })
        );
        expect(transform).toBeInstanceOf(TransitionTransform);
    });
});

class BatchRecorder extends FlowNode {
    /** @type {string[]} */
    events = [];

    reset() {
        super.reset();
        this.events.push("reset");
    }

    /** @param {import("../../types/flowBatch.js").FlowBatch} flowBatch */
    beginBatch(flowBatch) {
        if (flowBatch.type == "facet") {
            this.events.push("batch:" + flowBatch.facetId[0]);
        }
    }

    /** @param {import("../flowNode.js").Datum} datum */
    handle(datum) {
        this.events.push("row:" + datum.id);
    }

    complete() {
        this.events.push("complete");
    }
}

/** @param {TransitionTransform} transform @param {number} x */
function propagateFacets(transform, x) {
    transform.reset();
    transform.beginBatch({ type: "facet", facetId: ["a"] });
    transform.handle({ id: 1, x, y: 0 });
    transform.beginBatch({ type: "facet", facetId: ["b"] });
    transform.handle({ id: 2, x, y: 0 });
    transform.complete();
}
