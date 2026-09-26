import { describe, expect, test, vi } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createViewMutationApi } from "./viewMutationApi.js";
import { createViewQuery } from "../viewQuery.js";

/** @param {Record<string, any>[]} rows */
async function setup(rows) {
    const engine = await createHeadlessEngine({
        name: "track",
        title: "Test track",
        data: { values: rows },
        transform: [{ type: "formula", expr: "datum.x * 2", as: "doubled" }],
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative", scale: { zoom: true } },
        },
    });
    const api = createViewMutationApi({ viewRoot: engine.view });
    return {
        handle: api.get({ view: "track", scope: [] }),
        query: createViewQuery(api),
    };
}

describe("public view data reads", () => {
    test("reads transformed data with bounded lookahead and detached nested values", async () => {
        const { handle, query } = await setup([
            { x: 1, nested: { value: 2 } },
            { x: 3 },
        ]);
        expect(query.describe(handle).dataReady).toBe(true);

        const result = query.readData(handle, { limit: 1 });
        expect(result.rows[0].doubled).toBe(2);
        expect(result.rowsExamined).toBe(2);
        expect(result.truncated).toBe(true);

        /** @type {any} */ (result.rows[0].nested).value = 99;
        expect(query.readData(handle, { limit: 2 }).rows[0].nested).toEqual({
            value: 2,
        });
        expect(query.readData(handle, { limit: 2 })).toMatchObject({
            rowsExamined: 2,
            truncated: false,
        });

        expect(query.readData(handle, { limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 1,
            truncated: true,
        });

        const before = query.readData(handle, { limit: 2 }).rows;
        await handle.getScaleResolution("x").zoomTo([1, 2]);
        expect(query.readData(handle, { limit: 2 }).rows).toEqual(before);
    });

    test("handles empty data and rejects invalid limits", async () => {
        const { handle, query } = await setup([]);
        expect(query.readData(handle, { limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 0,
            truncated: false,
        });

        /** @type {unknown[]} */
        const invalidOptions = [undefined, null, [], 1];
        for (const options of invalidOptions) {
            expect(() =>
                query.readData(handle, /** @type {any} */ (options))
            ).toThrow("Data read options with a limit are required.");
        }

        for (const limit of [undefined, -1, 1.5, 1001]) {
            expect(() => query.readData(handle, { limit })).toThrow();
        }
    });

    test("rejects containers and finalized handles", async () => {
        const { view } = await createHeadlessViewHierarchy({ vconcat: [] });
        let active = true;
        const api = createViewMutationApi({ viewRoot: view }, () => active);
        const query = createViewQuery(api);
        expect(() => query.readData("root", { limit: 1 })).toThrow();
        active = false;
        expect(() => query.describe("root")).toThrow();
    });
});

test("describes inherited encoding and detaches nested metadata", async () => {
    const { view } = await createHeadlessViewHierarchy({
        encoding: {
            x: { field: "x", type: "quantitative", scale: { domain: [0, 10] } },
            color: { value: "red" },
        },
        layer: [
            {
                name: "track",
                title: "Test track",
                description: ["Test description"],
                mark: "point",
                encoding: { color: null },
            },
        ],
    });
    const api = createViewMutationApi({ viewRoot: view });
    const query = createViewQuery(api);
    const handle = api.get({ view: "track", scope: [] });
    const description = query.describe(handle);

    expect(description).toMatchObject({
        title: "Test track",
        description: ["Test description"],
        encoding: { x: { field: "x", scale: { domain: [0, 10] } } },
        dataReady: false,
    });
    expect(description.encoding).not.toHaveProperty("color");
    expect(query.describe("root").dataReady).toBe(false);

    /** @type {string[]} */ (description.description).push("changed");
    const x = /** @type {import("../spec/channel.js").PositionFieldDef} */ (
        description.encoding.x
    );
    x.scale.domain = [99, 100];
    expect(query.describe(handle).description).toEqual(["Test description"]);
    expect(query.describe(handle).encoding.x).toMatchObject({
        scale: { domain: [0, 10] },
    });
});

test("metadata cloning reads source getters once and rejects shared memory", async () => {
    const { view } = await createHeadlessViewHierarchy({
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const api = createViewMutationApi({ viewRoot: view });
    const query = createViewQuery(api);
    const handle = api.root();
    let reads = 0;
    /** @type {unknown} */
    let title = "X";
    // Install after view creation so this checks the public metadata boundary.
    Object.defineProperty(view.spec.encoding.x, "title", {
        enumerable: true,
        get() {
            reads++;
            return title;
        },
    });

    expect(query.describe(handle).encoding.x).toHaveProperty("title", "X");
    expect(reads).toBe(1);

    title = new SharedArrayBuffer(1);
    expect(() => query.describe(handle)).toThrow("Shared memory");
});

test("reads reject a view before data initialization", async () => {
    const { view } = await createHeadlessViewHierarchy({
        name: "unready",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const api = createViewMutationApi({ viewRoot: view });
    const query = createViewQuery(api);
    const unready = api.get({
        view: "unready",
        scope: [],
    });
    expect(query.describe(unready).dataReady).toBe(false);
    expect(() => query.readData(unready, { limit: 1 })).toThrow("not ready");
});

describe("view read lifecycle", () => {
    test.each(["removed", "finalized"])(
        "rejects all accessors after the view is %s",
        async (state) => {
            const { view } = await createHeadlessEngine({
                layer: [
                    {
                        name: "track",
                        data: { values: [{ x: 1 }] },
                        mark: "point",
                        encoding: { x: { field: "x", type: "quantitative" } },
                    },
                ],
            });
            let active = true;
            const api = createViewMutationApi({ viewRoot: view }, () => active);
            const query = createViewQuery(api);
            const handle = api.get({ view: "track", scope: [] });
            expect(query.readData(handle, { limit: 1 }).rows).toHaveLength(1);

            if (state === "removed") {
                await /** @type {import("./layerView.js").default} */ (
                    view
                ).removeChildAt(0);
            } else {
                active = false;
            }

            for (const read of [
                () => query.describe(handle),
                () => query.readData(handle, { limit: 1 }),
                () => handle.getScaleResolution("x"),
            ]) {
                expect(read).toThrow(
                    expect.objectContaining({
                        code:
                            state === "removed" ? "staleHandle" : "staleEmbed",
                    })
                );
            }
        }
    );
});

test("resolves public scale channels and rejects internal or invalid channels", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ x: 1, category: "A" }] },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            color: { field: "category", type: "nominal" },
            size: { field: "x", type: "quantitative" },
        },
    });
    const handle = createViewMutationApi({ viewRoot: view }).root();

    for (const channel of /** @type {const} */ (["x", "color", "size"])) {
        expect(handle.getScaleResolution(channel)).toBeDefined();
        expect(handle.getScaleResolution(channel)).toBe(
            view.getScaleResolution(channel)
        );
    }
    expect(handle.getScaleResolution("x2")).toBe(
        handle.getScaleResolution("x")
    );
    expect(handle.getScaleResolution("y")).toBeUndefined();
    expect(handle.getScaleResolution("y2")).toBeUndefined();
    for (const channel of ["sample", "text", "unknown", undefined, null]) {
        expect(() =>
            handle.getScaleResolution(/** @type {any} */ (channel))
        ).toThrow("Expected a scale-backed encoding channel");
    }
});

test("non-cloneable returned values reject without modifying source data", async () => {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const api = createViewMutationApi({ viewRoot: view });
    const query = createViewQuery(api);
    const handle = api.get({
        view: "track",
        scope: [],
    });
    // Loading itself clones source values. Add a runtime-only value afterward
    // so this test reaches the public read boundary rather than failing at load.
    const datum = /** @type {import("./unitView.js").default} */ (view)
        .getCollector()
        .getData()
        [Symbol.iterator]()
        .next().value;
    const callback = () => 42;
    datum.callback = callback;
    expect(query.describe(handle).dataReady).toBe(true);
    // An empty read only looks ahead; it does not clone the unreturned datum.
    expect(query.readData(handle, { limit: 0 }).truncated).toBe(true);
    expect(() => query.readData(handle, { limit: 1 })).toThrow(
        expect.objectContaining({ name: "DataCloneError" })
    );
    expect(datum.callback).toBe(callback);
});

/** @param {string[]} groups */
async function createFacetedTrack(groups) {
    // The sample encoding groups the terminal collector through normal dataflow.
    const { view } = await createHeadlessEngine({
        name: "track",
        data: {
            values: groups.map((group, index) => ({ x: index + 1, group })),
        },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            sample: { field: "group" },
        },
    });

    const api = createViewMutationApi({ viewRoot: view });
    const query = createViewQuery(api);
    return { handle: api.root(), query };
}

test("reads a single facet batch", async () => {
    const { handle, query } = await createFacetedTrack(["A", "A"]);

    expect(query.describe(handle).dataReady).toBe(true);
    expect(query.readData(handle, { limit: 2 }).rows).toEqual([
        { x: 1, group: "A" },
        { x: 2, group: "A" },
    ]);
});

test("rejects multiple facet batches", async () => {
    const { handle, query } = await createFacetedTrack(["A", "B"]);

    expect(() => query.readData(handle, { limit: 1 })).toThrow(
        "Faceted data reads are not supported"
    );
});

/** @type {[string, (buffer: SharedArrayBuffer) => unknown][]} */
const sharedMemoryCases = [
    ["buffer", (buffer) => buffer],
    ["typed array", (buffer) => new Uint8Array(buffer)],
    ["data view", (buffer) => new DataView(buffer)],
    ["map key", (buffer) => new Map([[buffer, 1]])],
    ["map value", (buffer) => new Map([[1, buffer]])],
    ["set", (buffer) => new Set([buffer])],
    ["error cause", (buffer) => new Error("nested", { cause: buffer })],
];

test.each(sharedMemoryCases)(
    "rejects shared memory in a returned %s",
    async (_, wrap) => {
        const buffer = new SharedArrayBuffer(1);
        const { handle, query } = await setup([
            { x: 1, payload: wrap(buffer) },
        ]);

        // Lookahead does not expose the row, so only a nonempty read rejects it.
        expect(query.readData(handle, { limit: 0 }).truncated).toBe(true);
        expect(() => query.readData(handle, { limit: 1 })).toThrow(
            "Shared memory"
        );
        expect(new Uint8Array(buffer)[0]).toBe(0);
    }
);

test("keeps ordinary buffers detached through cyclic maps and sets", async () => {
    const bytes = new Uint8Array([7]);
    const payload = new Map();
    payload.set("self", payload);
    payload.set("values", new Set([bytes]));
    const { handle, query } = await setup([{ x: 1, payload }]);

    const read = () =>
        /** @type {Map<string, any>} */ (
            query.readData(handle, { limit: 1 }).rows[0].payload
        );
    const result = read();
    expect(result.get("self")).toBe(result);
    result.get("values").values().next().value[0] = 99;
    expect(read().get("values").values().next().value[0]).toBe(7);
});

// Runtimes that preserve AggregateError also retain its non-enumerable errors.
// Other runtimes clone it as Error, dropping that collection entirely.
test.runIf(structuredClone(new AggregateError([])) instanceof AggregateError)(
    "rejects shared memory in an aggregate error collection",
    async () => {
        const payload = new AggregateError([new SharedArrayBuffer(1)]);
        const { handle, query } = await setup([{ x: 1, payload }]);
        expect(() => query.readData(handle, { limit: 1 })).toThrow(
            "Shared memory"
        );
    }
);

test("returns transformed gene rows without Core picking identifiers", async () => {
    const { view } = await createHeadlessEngine({
        name: "genes",
        data: { values: [{ symbol: "TP53", start: 10, end: 20 }] },
        transform: [
            { type: "formula", expr: "datum.end - datum.start", as: "span" },
        ],
        mark: "rect",
        encoding: {
            x: { field: "start", type: "quantitative" },
            x2: { field: "end" },
        },
    });
    const api = createViewMutationApi({ viewRoot: view });
    const query = createViewQuery(api);
    const handle = api.root();
    const datum = /** @type {import("./unitView.js").default} */ (view)
        .getCollector()
        .getData()
        [Symbol.iterator]()
        .next().value;
    const pickingId = datum[UNIQUE_ID_KEY];
    expect(pickingId).toBeTypeOf("number");

    expect(query.readData(handle, { limit: 1 }).rows).toEqual([
        { symbol: "TP53", start: 10, end: 20, span: 10 },
    ]);
    expect(datum[UNIQUE_ID_KEY]).toBe(pickingId);
});

test("rejects shared WebAssembly memory in returned data", async () => {
    const payload = new WebAssembly.Memory({
        initial: 1,
        maximum: 1,
        shared: true,
    });
    const { handle, query } = await setup([{ x: 1, payload }]);

    expect(() => query.readData(handle, { limit: 1 })).toThrow("Shared memory");
});

test("queries resolve replacements and reject foreign handles and unknown APIs", async () => {
    const spec = {
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: /** @type {const} */ ("point"),
    };
    const first = await createHeadlessEngine(spec);
    const replacement = await createHeadlessEngine({
        ...spec,
        data: { values: [{ x: 2 }] },
    });
    // A root swap checks that selectors resolve current state, while handles
    // remain attached to their original view instance.
    const runtime = { viewRoot: first.view };
    const api = createViewMutationApi(runtime);
    const query = createViewQuery(api);
    /** @type {import("../types/embedApi.js").ViewAddress} */
    const selector = { scope: [], view: "track" };
    const oldHandle = api.get(selector);
    const foreign = createViewMutationApi({
        viewRoot: replacement.view,
    }).root();

    expect(() => query.describe(foreign)).toThrow(
        expect.objectContaining({ code: "unresolvedAddress" })
    );
    expect(() => query.readData(foreign, { limit: 1 })).toThrow();
    expect(() => createViewQuery(/** @type {any} */ ({}))).toThrow(
        "same module instance"
    );

    runtime.viewRoot = replacement.view;
    expect(query.readData(selector, { limit: 1 }).rows).toEqual([{ x: 2 }]);
    expect(query.readData("root", { limit: 1 }).rows).toEqual([{ x: 2 }]);
    expect(() => query.describe(oldHandle)).toThrow(
        expect.objectContaining({ code: "staleHandle" })
    );
    expect(() => query.readData(oldHandle, { limit: 1 })).toThrow();
    expect(query.describe(api.get(selector))).toEqual(query.describe(selector));
});

test("queries created before or after finalization reject reads and descriptions", async () => {
    const { view } = await createHeadlessEngine({
        mark: "point",
        data: { values: [] },
    });
    let active = true;
    const api = createViewMutationApi({ viewRoot: view }, () => active);
    const query = createViewQuery(api);
    const handle = api.root();
    expect(handle).not.toHaveProperty("describe");
    expect(handle).not.toHaveProperty("readData");
    expect(query.readData(handle, { limit: 1 })).not.toHaveProperty("ready");

    active = false;
    for (const reader of [query, createViewQuery(api)]) {
        for (const address of /** @type {const} */ ([handle, "root"])) {
            expect(() => reader.describe(address)).toThrow(
                expect.objectContaining({ code: "staleEmbed" })
            );
            expect(() => reader.readData(address, { limit: 1 })).toThrow(
                expect.objectContaining({ code: "staleEmbed" })
            );
        }
    }
});

test("rejects a query module loaded from a separate Core instance", async () => {
    const { view } = await createHeadlessViewHierarchy({ mark: "point" });
    const api = createViewMutationApi({ viewRoot: view });
    vi.resetModules();
    const separate = await import("../viewQuery.js");

    expect(() => separate.createViewQuery(api)).toThrow("same module instance");
    expect(createViewQuery(api).describe("root").dataReady).toBe(false);
});
