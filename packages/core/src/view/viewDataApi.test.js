import { expect, test } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createViewMutationApi } from "./viewMutationApi.js";

/** @param {Record<string, any>[]} rows */
async function setup(rows) {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: rows },
        transform: [{ type: "formula", expr: "datum.x * 2", as: "doubled" }],
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative", scale: { zoom: true } },
        },
    });
    return {
        handle: createViewMutationApi({ viewRoot: view }).get({
            view: "track",
            scope: [],
        }),
        view,
    };
}

test("reads transformed records with bounded lookahead and detached nested values", async () => {
    const { handle, view } = await setup([
        { x: 1, nested: { value: 2 } },
        { x: 3 },
    ]);
    const result = handle.readData({ limit: 1 });
    expect(result).toEqual({
        rows: [{ x: 1, doubled: 2, nested: { value: 2 } }],
        truncated: true,
    });
    /** @type {any} */ (result.rows[0].nested).value = 99;
    expect(handle.readData({ limit: 2 })).toEqual({
        rows: [
            { x: 1, doubled: 2, nested: { value: 2 } },
            { x: 3, doubled: 6 },
        ],
        truncated: false,
    });
    expect(handle.readData({ limit: 0 })).toEqual({
        rows: [],
        truncated: true,
    });
    const before = handle.readData({ limit: 2 });
    await view.getScaleResolution("x").zoomTo([1, 2]);
    expect(handle.readData({ limit: 2 })).toEqual(before);
});

test("handles empty data and requires an explicit safe integer limit", async () => {
    const { handle } = await setup([]);
    expect(handle.readData({ limit: 0 })).toEqual({
        rows: [],
        truncated: false,
    });
    for (const options of [
        undefined,
        null,
        [],
        1,
        {},
        { limit: -1 },
        { limit: 1.5 },
        { limit: Infinity },
        { limit: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
        expect(() => handle.readData(/** @type {any} */ (options))).toThrow(
            "nonnegative safe integer limit"
        );
    }
    expect(handle.readData({ limit: 10001 }).truncated).toBe(false);
});

test("rejects containers and uninitialized data", async () => {
    const { view } = await createHeadlessViewHierarchy({
        vconcat: [
            { name: "track", data: { values: [{ x: 1 }] }, mark: "point" },
        ],
    });
    const api = createViewMutationApi({ viewRoot: view });
    expect(() => api.root().readData({ limit: 1 })).toThrow("unit view");
    expect(() =>
        api.get({ scope: [], view: "track" }).readData({ limit: 1 })
    ).toThrow("not ready");
});

test.each(["removed", "finalized"])(
    "rejects reads after a view is %s",
    async (state) => {
        const { view } = await createHeadlessEngine({
            layer: [
                { name: "track", data: { values: [{ x: 1 }] }, mark: "point" },
            ],
        });
        let active = true;
        const api = createViewMutationApi({ viewRoot: view }, () => active);
        const handle = api.get({ scope: [], view: "track" });
        expect(handle.readData({ limit: 1 }).rows).toHaveLength(1);
        if (state === "removed") await api.remove(handle);
        else active = false;
        expect(() => handle.readData({ limit: 1 })).toThrow(
            expect.objectContaining({
                code: state === "removed" ? "staleHandle" : "staleEmbed",
            })
        );
    }
);

test("reads all facet batches in collector order", async () => {
    const { view } = await createHeadlessEngine({
        data: {
            values: [
                { x: 1, group: "A" },
                { x: 2, group: "B" },
                { x: 3, group: "A" },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            sample: { field: "group" },
        },
    });
    const handle = createViewMutationApi({ viewRoot: view }).root();
    expect(handle.readData({ limit: 3 })).toEqual({
        rows: [
            { x: 1, group: "A" },
            { x: 3, group: "A" },
            { x: 2, group: "B" },
        ],
        truncated: false,
    });
    expect(handle.readData({ limit: 2 }).truncated).toBe(true);
});

test("non-cloneable returned values reject without modifying source data", async () => {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const api = createViewMutationApi({ viewRoot: view });
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
    // An empty read only looks ahead; it does not clone the unreturned datum.
    expect(handle.readData({ limit: 0 }).truncated).toBe(true);
    expect(() => handle.readData({ limit: 1 })).toThrow(
        expect.objectContaining({ name: "DataCloneError" })
    );
    expect(datum.callback).toBe(callback);
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
        const { handle } = await setup([{ x: 1, payload: wrap(buffer) }]);

        // Lookahead does not expose the row, so only a nonempty read rejects it.
        expect(handle.readData({ limit: 0 }).truncated).toBe(true);
        expect(() => handle.readData({ limit: 1 })).toThrow("Shared memory");
        expect(new Uint8Array(buffer)[0]).toBe(0);
    }
);

test("keeps ordinary buffers detached through cyclic maps and sets", async () => {
    const bytes = new Uint8Array([7]);
    const payload = new Map();
    payload.set("self", payload);
    payload.set("values", new Set([bytes]));
    const { handle } = await setup([{ x: 1, payload }]);

    const read = () =>
        /** @type {Map<string, any>} */ (
            handle.readData({ limit: 1 }).rows[0].payload
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
        const { handle } = await setup([{ x: 1, payload }]);
        expect(() => handle.readData({ limit: 1 })).toThrow("Shared memory");
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
    const handle = api.root();
    const datum = /** @type {import("./unitView.js").default} */ (view)
        .getCollector()
        .getData()
        [Symbol.iterator]()
        .next().value;
    const pickingId = datum[UNIQUE_ID_KEY];
    expect(pickingId).toBeTypeOf("number");

    expect(handle.readData({ limit: 1 }).rows).toEqual([
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
    const { handle } = await setup([{ x: 1, payload }]);

    expect(() => handle.readData({ limit: 1 })).toThrow("Shared memory");
});
