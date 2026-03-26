import { describe, expect, test } from "vitest";
import {
    LinkVertexBuilder,
    PointVertexBuilder,
    RectVertexBuilder,
} from "./dataToVertices.js";

function makeScale() {
    return /** @type {any} */ ({
        type: "linear",
        domain: () => [0, 100],
    });
}

/**
 * @param {string} field
 */
function makeAccessor(field) {
    /** @param {Record<string, any>} datum */
    const accessor = (datum) => datum[field];
    accessor.constant = false;
    accessor.asNumberAccessor = () => accessor;
    return accessor;
}

/**
 * @param {string} field
 * @param {boolean} [buildIndex=false]
 */
function makeEncoder(field, buildIndex = false) {
    return /** @type {any} */ ({
        branches: [{ accessor: makeAccessor(field) }],
        channelDef: { buildIndex },
        constant: false,
        scale: makeScale(),
    });
}

describe("Vertex builders", () => {
    test("RectVertexBuilder builds x-indexes from generated vertex buffers", () => {
        const builder = new RectVertexBuilder({
            encoders: {
                x: makeEncoder("x", true),
                x2: makeEncoder("x2"),
            },
            attributes: ["x", "x2"],
            numItems: 2,
        });

        builder.addBatch("facet", [
            { x: 10, x2: 12 },
            { x: 20, x2: 22 },
        ]);

        const rangeEntry = builder.rangeMap.get("facet");

        // Rects emit six vertices per datum, so the x-index should cover each run.
        expect(rangeEntry.count).toBe(12);
        expect(rangeEntry.xIndex).toBeTypeOf("function");
        expect(rangeEntry.xIndex(11, 13)).toEqual([0, 6]);
        expect(rangeEntry.xIndex(21, 23)).toEqual([6, 12]);
    });

    test("PointVertexBuilder builds x-indexes from generated vertex buffers", () => {
        const builder = new PointVertexBuilder({
            encoders: {
                x: makeEncoder("x", true),
            },
            attributes: ["x"],
            numItems: 3,
        });

        builder.addBatch("facet", [{ x: 11 }, { x: 21 }, { x: 31 }]);

        const rangeEntry = builder.rangeMap.get("facet");

        expect(rangeEntry.count).toBe(3);
        expect(rangeEntry.xIndex).toBeTypeOf("function");
        expect(rangeEntry.xIndex(21.1, 21.9)).toEqual([1, 2]);
    });

    test("LinkVertexBuilder keeps the x-index aligned with instanced vertex ranges", () => {
        const builder = new LinkVertexBuilder({
            encoders: {
                x: makeEncoder("x", true),
            },
            attributes: ["x"],
            numItems: 2,
        });

        builder.addBatch("facet", [{ x: 5 }, { x: 15 }]);

        const rangeEntry = builder.rangeMap.get("facet");

        expect(rangeEntry.count).toBe(2);
        expect(rangeEntry.xIndex).toBeTypeOf("function");
        expect(rangeEntry.xIndex(15.1, 15.9)).toEqual([1, 2]);
    });
});
