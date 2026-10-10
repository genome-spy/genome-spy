import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createViewQuery } from "../viewQuery.js";
import { renderToLayout } from "./testUtils.js";

/** @param {{x: number, y: number, name: string}[]} [rows] */
async function setup(
    rows = [
        { x: 1, y: 2, name: "same" },
        { x: 2, y: 3, name: "same" },
    ]
) {
    const { view } = await createHeadlessEngine({
        name: "points",
        width: 400,
        height: 300,
        data: {
            values: rows,
        },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 4], zoom: true },
            },
            y: { field: "y", type: "quantitative", scale: { domain: [0, 4] } },
        },
    });
    const query = createViewQuery(createViewMutationApi({ viewRoot: view }));
    view.context.renderImmediately = vi.fn();
    return { view, query };
}
const options = {
    channels: /** @type {("x"|"y")[]} */ (["x", "y"]),
    fields: ["x", "y", "name"],
    limit: 100,
    includeAnnotationTargets: true,
};

test("distinct source references survive filter/window despite duplicate labels", async () => {
    const { query } = await setup();
    const result = await query.queryData("root", {
        ...options,
        analysis: [
            {
                type: "window",
                ops: ["row_number"],
                as: ["rank"],
                sort: { field: "x", order: "descending" },
                frame: [null, null],
            },
            { type: "filter", field: "rank", op: "eq", value: 1 },
        ],
    });
    expect(result.rows).toMatchObject([{ x: 2 }]);
    expect(result.annotationTargets).toHaveLength(1);
    await query.annotations.replace({
        targets: [{ reference: result.annotationTargets[0], text: "Second" }],
        emphasis: "purple",
        connectors: true,
    });
    expect(query.annotations.inspect().activeTargets).toBe(1);
});

test("replacement validates before clearing, references expire, clear and disposal release state", async () => {
    const { query } = await setup();
    const result = await query.queryData("root", options);
    expect(new Set(result.annotationTargets).size).toBe(2);
    await query.annotations.replace({
        targets: [{ reference: result.annotationTargets[0] }],
        emphasis: "blue",
    });
    await expect(
        query.annotations.replace({ targets: [{ reference: "foreign" }] })
    ).rejects.toThrow("Unknown");
    expect(query.annotations.inspect().activeTargets).toBe(1);
    await query.queryData("root", options);
    await expect(
        query.annotations.replace({
            targets: [{ reference: result.annotationTargets[0] }],
        })
    ).rejects.toThrow("expired");
    query.annotations.clear();
    expect(query.annotations.inspect().activeTargets).toBe(0);
    query.annotations.dispose();
    expect(() => query.annotations.inspect()).toThrow("disposed");
});

test("aggregate results cannot request point references", async () => {
    const { query } = await setup();
    await expect(
        query.queryData("root", {
            ...options,
            analysis: [
                {
                    type: "aggregate",
                    fields: [null],
                    ops: ["count"],
                    as: ["n"],
                },
            ],
        })
    ).rejects.toThrow("row-preserving");
});

test("ordinary overlay marks attach to the same root plot without changing source data or domains", async () => {
    const { query, view } = await setup();
    const original = query.describe("root");
    const result = await query.queryData("root", options);
    await query.annotations.replace({
        targets: [{ reference: result.annotationTargets[0], text: "First" }],
        emphasis: "orange",
        connectors: true,
    });
    const layout = await renderToLayout(view);
    expect(layout).toBeDefined();
    expect(query.describe("root")).toEqual(original);
    expect(view.getScaleResolution("x").getDomain()).toEqual([0, 4]);
});

test("clear and dispose prevent pending replacements from publishing", async () => {
    for (const operation of /** @type {const} */ (["clear", "dispose"])) {
        const { query } = await setup();
        const result = await query.queryData("root", options);
        const replacement = query.annotations.replace({
            targets: [{ reference: result.annotationTargets[0] }],
            emphasis: "blue",
        });
        query.annotations[operation]();
        await expect(replacement).rejects.toThrow(
            operation === "clear" ? "superseded" : "disposed"
        );
        if (operation === "clear")
            expect(query.annotations.inspect().activeTargets).toBe(0);
    }
});

test("abort preserves a previously applied valid set", async () => {
    const { query } = await setup();
    const result = await query.queryData("root", options);
    const set = {
        targets: [{ reference: result.annotationTargets[0] }],
        emphasis: /** @type {const} */ ("blue"),
    };
    await query.annotations.replace(set);
    const controller = new AbortController();
    controller.abort();
    await expect(
        query.annotations.replace(set, { signal: controller.signal })
    ).rejects.toThrow();
    expect(query.annotations.inspect().activeTargets).toBe(1);
});

test("new source publications invalidate applied annotations and references", async () => {
    const { query, view } = await setup();
    const result = await query.queryData("root", options);
    await query.annotations.replace({
        targets: [{ reference: result.annotationTargets[0] }],
        emphasis: "purple",
    });
    const source =
        /** @type {import('../data/sources/inlineSource.js').default} */ (
            view.flowHandle.dataSource
        );
    source.updateDynamicData([{ x: 3, y: 3 }]);
    expect(query.annotations.inspect()).toMatchObject({
        activeTargets: 0,
        invalidated: true,
    });
    await expect(
        query.annotations.replace({
            targets: [{ reference: result.annotationTargets[0] }],
        })
    ).rejects.toThrow("invalidated");
});

test("query clients share one annotation owner and a disposed owner can be recreated", async () => {
    const { view } = await setup();
    const views = createViewMutationApi({ viewRoot: view });
    const first = createViewQuery(views);
    const second = createViewQuery(views);
    expect(second.annotations).toBe(first.annotations);
    first.annotations.dispose();
    expect(createViewQuery(views).annotations).not.toBe(first.annotations);
});

test("overlapping replacement setup shares one overlay and latest replacement wins", async () => {
    const { query } = await setup();
    const result = await query.queryData("root", options);
    const first = query.annotations.replace({
        targets: [{ reference: result.annotationTargets[0] }],
        emphasis: "blue",
    });
    const second = query.annotations.replace({
        targets: [{ reference: result.annotationTargets[1] }],
        emphasis: "purple",
    });
    await expect(first).rejects.toThrow("superseded");
    await second;
    expect(query.annotations.inspect().activeTargets).toBe(1);
});

test("nested expression references in point geometry are unsupported", async () => {
    for (const encoding of [
        { size: { value: { expr: "pointSize" } } },
        { size: { datum: { expr: "pointSize" }, type: "quantitative" } },
    ]) {
        const { view } = await createHeadlessEngine({
            params: [{ name: "pointSize", value: 100 }],
            mark: "point",
            data: { values: [{ x: 1, y: 2 }] },
            encoding: /** @type {any} */ ({
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                ...encoding,
            }),
        });
        const query = createViewQuery(
            createViewMutationApi({ viewRoot: view })
        );
        expect(query.assessAnnotations("root")).toEqual({
            status: "unsupported",
            reason: "Parameter-dependent point geometry is not supported.",
        });
    }
});

test("layout failures reject annotation completion immediately", async () => {
    const { view, query } = await setup();
    const result = await query.queryData("root", options);
    view.context.computeLayout = () => {
        throw new Error("Layout failed");
    };
    await expect(
        query.annotations.replace({
            targets: [{ reference: result.annotationTargets[0] }],
            emphasis: "purple",
        })
    ).rejects.toThrow("Layout failed");
});

test("expression-driven mark properties are explicitly unsupported", async () => {
    for (const property of ["inwardStroke", "semanticZoomFraction"]) {
        const { view } = await createHeadlessEngine({
            params: [{ name: "geometry", value: 1 }],
            mark: /** @type {any} */ ({
                type: "point",
                [property]: { expr: "geometry" },
            }),
            data: { values: [{ x: 1, y: 2 }] },
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        });
        const query = createViewQuery(
            createViewMutationApi({ viewRoot: view })
        );
        expect(query.assessAnnotations("root").status).toBe("unsupported");
    }
});

test("invisible replacement arguments preserve the previous visible set", async () => {
    const { query } = await setup();
    const result = await query.queryData("root", options);
    const targets = [{ reference: result.annotationTargets[0] }];
    await query.annotations.replace({ targets, emphasis: "blue" });
    await expect(query.annotations.replace({ targets })).rejects.toThrow(
        "need text"
    );
    await expect(
        query.annotations.replace({
            targets,
            emphasis: "blue",
            connectors: true,
        })
    ).rejects.toThrow("connectors need text");
    expect(query.annotations.inspect().activeTargets).toBe(1);
});

test("annotates a complete result larger than 1000 points", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({
        x: i / 500,
        y: 2,
        name: String(i),
    }));
    const { query } = await setup(rows);
    const result = await query.queryData("root", {
        ...options,
        limit: null,
        analysis: [],
    });
    expect(result.rows).toEqual(rows.map(({ x, y, name }) => ({ x, y, name })));
    expect(new Set(result.annotationTargets).size).toBe(rows.length);
    await query.annotations.replace({
        targets: result.annotationTargets.map((reference, i) => ({
            reference,
            text: String(result.rows[i].name),
        })),
        emphasis: "purple",
    });
    expect(query.annotations.inspect().activeTargets).toBe(rows.length);
    await query.annotations.clear();
    expect(query.annotations.inspect().activeTargets).toBe(0);
    query.annotations.dispose();
});
