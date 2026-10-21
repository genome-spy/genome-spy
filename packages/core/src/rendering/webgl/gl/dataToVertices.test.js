import { describe, expect, test } from "vitest";
import createIndexer from "../../../utils/indexer.js";
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
    test("categorical attributes preserve IDs beyond the 16-bit boundary", () => {
        // Stable IDs can outgrow the active domain after repeated replacement.
        const indexer = createIndexer();
        indexer.addAll(Array.from({ length: 65537 }, (_, i) => "category" + i));
        const encoder = makeEncoder("category");
        encoder.scale = { type: "band", props: { domainIndexer: indexer } };
        const builder = new PointVertexBuilder({
            encoders: { x: encoder },
            attributes: ["x"],
            numItems: 2,
        });
        builder.addBatch(null, [
            { category: "category0" },
            { category: "category65536" },
        ]);

        expect(Array.from(builder.toArrays().arrays.attr_x.data)).toEqual([
            0, 65536,
        ]);
    });

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

        builder.addBatch("facet", [{ x: 0 }, { x: 20 }, { x: 40 }]);

        const rangeEntry = builder.rangeMap.get("facet");

        expect(rangeEntry.count).toBe(3);
        expect(rangeEntry.xIndex).toBeTypeOf("function");
        expect(rangeEntry.xIndex(-1, 100)).toEqual([0, 3]);
        expect(rangeEntry.xIndex(19, 21)).toEqual([1, 2]);
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
