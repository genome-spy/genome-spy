import { expect, test, vi } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewContext,
} from "../../genomeSpy/headlessBootstrap.js";
import { getSpecErrorLocation } from "../../utils/specError.js";
import Rectangle from "../../view/layout/rectangle.js";
import { renderToLayout } from "../../view/testUtils.js";

/**
 * @typedef {object} FieldErrorCase
 * @prop {import("../../spec/transform.js").TransformParams} transform
 * @prop {Record<string, any>[]} data
 * @prop {(string | number)[]} path
 */

/** @type {FieldErrorCase[]} */
const cases = [
    {
        transform: {
            type: "aggregate",
            fields: ["value", "missing"],
            ops: ["sum", "sum"],
        },
        data: [{ value: 1 }],
        path: ["fields", 1],
    },
    {
        transform: { type: "aggregate", groupby: ["missing"] },
        data: [{ value: 1 }],
        path: ["groupby", 0],
    },
    {
        transform: { type: "collect", groupby: ["missing"] },
        data: [{}],
        path: ["groupby", 0],
    },
    {
        transform: { type: "alignmentMismatches", cigar: "missing" },
        data: [{ start: 0 }],
        path: ["cigar"],
    },
    {
        transform: { type: "alignmentMismatches", md: "missing" },
        data: [{ start: 0, cigar: "10M" }],
        path: ["md"],
    },
    {
        transform: { type: "alignmentMismatches", sequence: "missing" },
        data: [{ start: 0, cigar: "10M", md: "4A5" }],
        path: ["sequence"],
    },
    {
        transform: { type: "coverage", start: "start", end: "missing" },
        data: [{ start: 0 }],
        path: ["end"],
    },
    {
        transform: { type: "flatten", fields: ["values", "missing"] },
        data: [{ values: [1, 2] }],
        path: ["fields", 1],
    },
    {
        transform: { type: "flatten", fields: "missing" },
        data: [{}],
        path: ["fields"],
    },
    {
        transform: { type: "flattenCigar", start: "missing" },
        data: [{ cigar: "10M" }],
        path: ["start"],
    },
    {
        transform: { type: "flattenCompressedExons", exons: "missing" },
        data: [{ start: 0 }],
        path: ["exons"],
    },
    {
        transform: {
            type: "flattenDelimited",
            field: ["value", "missing"],
            separator: [",", ","],
        },
        data: [{ value: "a,b" }],
        path: ["field", 1],
    },
    {
        transform: { type: "flattenSequence", field: "missing" },
        data: [{}],
        path: ["field"],
    },
    {
        // An omitted default field has no value to underline: locate its declaration.
        transform: { type: "flattenSequence" },
        data: [{}],
        path: [],
    },
    {
        transform: {
            type: "measureText",
            field: "missing",
            as: "width",
            fontSize: 10,
        },
        data: [{}],
        path: ["field"],
    },
    {
        transform: {
            type: "packLegendLabels",
            labelWidth: "missing",
            yExtent: 100,
        },
        data: [{}],
        path: ["labelWidth"],
    },
    {
        transform: { type: "pileup", start: "start", end: "missing" },
        data: [{ start: 0 }],
        path: ["end"],
    },
    {
        transform: { type: "project", fields: ["value", "missing"] },
        data: [{ value: 1 }],
        path: ["fields", 1],
    },
    {
        transform: {
            type: "regexExtract",
            field: "missing",
            regex: "(.*)",
            as: "value",
        },
        data: [{}],
        path: ["field"],
    },
    {
        transform: {
            type: "setIntersection",
            element: ["value", "missing"],
            set: "set",
        },
        data: [{ value: 1, set: "A" }],
        path: ["element", 1],
    },
    {
        transform: { type: "stack", field: "missing", groupby: [] },
        data: [{}],
        path: ["field"],
    },
    {
        transform: { type: "truncateText", field: "missing", fontSize: 10 },
        data: [{}],
        path: ["field"],
    },
    {
        transform: {
            type: "window",
            ops: ["row_number", "sum"],
            fields: [null, "missing"],
        },
        data: [{}],
        path: ["fields", 1],
    },
    {
        transform: {
            type: "window",
            ops: ["row_number"],
            groupby: ["missing"],
        },
        data: [{}],
        path: ["groupby", 0],
    },
    {
        transform: {
            type: "lookup",
            from: { values: [{ id: 1 }] },
            key: "missing",
        },
        data: [{ id: 1 }],
        path: ["key"],
    },
    {
        transform: {
            type: "lookup",
            from: { values: [{ id: 1 }] },
            key: "id",
            fields: ["missing"],
            values: ["id"],
            as: ["copy"],
        },
        data: [{ id: 1 }],
        path: ["fields", 0],
    },
    {
        transform: {
            type: "lookup",
            from: { values: [{ id: 1, score: 7 }] },
            key: "id",
        },
        data: [{}],
        path: ["key"],
    },
    {
        transform: {
            type: "lookup",
            from: { values: [{ id: 1, score: 7 }, { id: 2 }] },
            key: "id",
        },
        data: [{ id: 2 }],
        path: [],
    },
    {
        transform: {
            type: "lookup",
            from: { values: [{ id: 1 }] },
            key: "id",
            values: ["missing"],
        },
        data: [{ id: 1 }],
        path: ["values", 0],
    },
    {
        transform: {
            type: "lookup",
            from: { source: "input" },
            key: ["id", "missing"],
            values: ["id"],
            as: ["copy"],
        },
        data: [{ id: 1 }],
        path: ["key", 1],
    },
];

test.each(cases)(
    "locates $transform.type field access at $path",
    async ({ transform, data, path }) => {
        const context = createHeadlessViewContext();
        context.getSpecOrigin = (fragment) =>
            fragment === transform ? "/transform/0" : undefined;

        await expect(
            createHeadlessEngine(
                {
                    data: { values: data },
                    transform: [transform],
                    mark: "point",
                },
                { context }
            )
        ).rejects.toSatisfy((error) => {
            expect(error.message).toContain("Invalid field");
            expect(getSpecErrorLocation(error)).toEqual({
                origin: "/transform/0",
                path,
            });
            return true;
        });
    }
);

test.each(["collect", "stack", "window"])(
    "locates %s sort fields",
    async (type) => {
        const sort = { field: ["value", "missing"] };
        const transform =
            type == "window"
                ? { type, sort, ops: ["row_number"] }
                : type == "stack"
                  ? { type, sort, groupby: /** @type {string[]} */ ([]) }
                  : { type, sort };
        const context = createHeadlessViewContext();
        context.getSpecOrigin = (fragment) =>
            fragment === sort ? "/transform/0/sort" : undefined;

        await expect(
            createHeadlessEngine(
                {
                    data: { values: [{ value: 1 }, { value: 1 }] },
                    transform: [
                        /** @type {import("../../spec/transform.js").TransformParams} */ (
                            transform
                        ),
                    ],
                    mark: "point",
                },
                { context }
            )
        ).rejects.toSatisfy((error) => {
            expect(error.message).toContain('Invalid field "missing"');
            expect(getSpecErrorLocation(error)).toEqual({
                origin: "/transform/0/sort",
                path: ["field", 1],
            });
            return true;
        });
    }
);

test("locates collect's single-field numeric sort", async () => {
    const sort = { field: "missing" };
    const context = createHeadlessViewContext();
    context.getSpecOrigin = (fragment) =>
        fragment === sort ? "/transform/0/sort" : undefined;

    await expect(
        createHeadlessEngine(
            {
                data: { values: [{ value: 1 }, { value: 2 }] },
                transform: [{ type: "collect", sort }],
                mark: "point",
            },
            { context }
        )
    ).rejects.toSatisfy((error) => {
        expect(error.message).toContain('Invalid field "missing"');
        expect(getSpecErrorLocation(error)).toEqual({
            origin: "/transform/0/sort",
            path: ["field"],
        });
        return true;
    });
});

test("locates linearized coordinate array entries with the default channel", async () => {
    const transform = {
        type: /** @type {const} */ ("linearizeGenomicCoordinate"),
        chrom: "chrom",
        pos: ["pos", "missing"],
        as: ["start", "end"],
    };
    const context = createHeadlessViewContext();
    context.getSpecOrigin = (fragment) =>
        fragment === transform ? "/transform/0" : undefined;

    await expect(
        createHeadlessEngine(
            {
                data: { values: [{ chrom: "chr1", pos: 10 }] },
                transform: [transform],
                mark: "point",
                encoding: {
                    x: {
                        field: "start",
                        type: "locus",
                        scale: { domain: [0, 100] },
                        axis: null,
                    },
                },
            },
            { context }
        )
    ).rejects.toSatisfy((error) => {
        expect(error.message).toContain('Invalid field "missing"');
        expect(getSpecErrorLocation(error)).toEqual({
            origin: "/transform/0",
            path: ["pos", 1],
        });
        return true;
    });
});

test("locates scored-label fields when layout makes the labels visible", async () => {
    const transform = {
        type: /** @type {const} */ ("filterScoredLabels"),
        pos: "pos",
        width: "missing",
        score: "score",
    };
    const context = createHeadlessViewContext();
    context.getSpecOrigin = (fragment) =>
        fragment === transform ? "/transform/0" : undefined;
    const { view } = await createHeadlessEngine(
        {
            data: { values: [{ pos: 10, score: 1 }] },
            transform: [transform],
            mark: "point",
            encoding: {
                x: {
                    field: "pos",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                    axis: null,
                },
            },
        },
        { context }
    );

    try {
        expect(() => {
            renderToLayout(view, Rectangle.create(0, 0, 100, 100));
            view.handleBroadcast({ type: "layoutComputed" });
            view.paramRuntime.flushNow();
        }).toThrowError(
            expect.objectContaining({
                message: expect.stringContaining('Invalid field "missing"'),
                specLocation: { origin: "/transform/0", path: ["width"] },
            })
        );
    } finally {
        view.disposeSubtree();
    }
});

test("reports transform field locations through source loading status", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("value\n1\n"));
    const transform = {
        type: /** @type {const} */ ("project"),
        fields: ["value", "missing"],
    };
    const data = { url: "data.csv" };
    const context = createHeadlessViewContext();
    context.getSpecOrigin = (fragment) =>
        fragment === transform
            ? "/transform/0"
            : fragment === data
              ? "/data"
              : undefined;

    try {
        const { view } = await createHeadlessEngine(
            { data, transform: [transform], mark: "point" },
            { context }
        );
        expect(context.dataFlow.loadingStatusRegistry.getSnapshot()).toEqual([
            expect.objectContaining({
                status: "error",
                origin: "/data",
                errorPhase: "processing",
                errorLocation: { origin: "/transform/0", path: ["fields", 1] },
                message: expect.stringContaining('Invalid field "missing"'),
            }),
        ]);
        view.disposeSubtree();
    } finally {
        fetch.mockRestore();
    }
});
