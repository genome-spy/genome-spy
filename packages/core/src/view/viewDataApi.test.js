import { describe, expect, test } from "vitest";
import {
    createHeadlessEngine,
    createHeadlessViewHierarchy,
} from "../genomeSpy/headlessBootstrap.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { createViewMutationApi } from "./viewMutationApi.js";

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
    return createViewMutationApi({ viewRoot: engine.view }).get({
        view: "track",
        scope: [],
    });
}

describe("public view data reads", () => {
    test("reads transformed data with bounded lookahead and detached nested values", async () => {
        const handle = await setup([{ x: 1, nested: { value: 2 } }, { x: 3 }]);
        expect(handle.describe().dataReady).toBe(true);

        const result = handle.readData({ limit: 1 });
        expect(result.rows[0].doubled).toBe(2);
        expect(result.rowsExamined).toBe(2);
        expect(result.truncated).toBe(true);

        /** @type {any} */ (result.rows[0].nested).value = 99;
        expect(handle.readData({ limit: 2 }).rows[0].nested).toEqual({
            value: 2,
        });
        expect(handle.readData({ limit: 2 })).toMatchObject({
            rowsExamined: 2,
            truncated: false,
        });

        expect(handle.readData({ limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 1,
            truncated: true,
        });

        const before = handle.readData({ limit: 2 }).rows;
        await handle.getScaleResolution("x").zoomTo([1, 2]);
        expect(handle.readData({ limit: 2 }).rows).toEqual(before);
    });

    test("handles empty data and rejects invalid limits", async () => {
        const handle = await setup([]);
        expect(handle.readData({ limit: 0 })).toMatchObject({
            rows: [],
            rowsExamined: 0,
            truncated: false,
        });

        /** @type {unknown[]} */
        const invalidOptions = [undefined, null, [], 1];
        for (const options of invalidOptions) {
            expect(() => handle.readData(/** @type {any} */ (options))).toThrow(
                "Data read options with a limit are required."
            );
        }

        for (const limit of [undefined, -1, 1.5, 1001]) {
            expect(() => handle.readData({ limit })).toThrow();
        }
    });

    test("rejects containers and finalized handles", async () => {
        const { view } = await createHeadlessViewHierarchy({ vconcat: [] });
        let active = true;
        const api = createViewMutationApi({ viewRoot: view }, () => active);
        expect(() => api.root().readData({ limit: 1 })).toThrow();
        active = false;
        expect(() => api.root().describe()).toThrow();
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
    const handle = api.get({ view: "track", scope: [] });
    const description = handle.describe();

    expect(description).toMatchObject({
        title: "Test track",
        description: ["Test description"],
        encoding: { x: { field: "x", scale: { domain: [0, 10] } } },
        dataReady: false,
    });
    expect(description.encoding).not.toHaveProperty("color");
    expect(api.root().describe().dataReady).toBe(false);

    /** @type {string[]} */ (description.description).push("changed");
    const x = /** @type {import("../spec/channel.js").PositionFieldDef} */ (
        description.encoding.x
    );
    x.scale.domain = [99, 100];
    expect(handle.describe().description).toEqual(["Test description"]);
    expect(handle.describe().encoding.x).toMatchObject({
        scale: { domain: [0, 10] },
    });
});

test("metadata cloning reads source getters once and rejects shared memory", async () => {
    const { view } = await createHeadlessViewHierarchy({
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const handle = createViewMutationApi({ viewRoot: view }).root();
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

    expect(handle.describe().encoding.x).toHaveProperty("title", "X");
    expect(reads).toBe(1);

    title = new SharedArrayBuffer(1);
    expect(() => handle.describe()).toThrow("Shared memory");
});

test("reads reject a view before data initialization", async () => {
    const { view } = await createHeadlessViewHierarchy({
        name: "unready",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const unready = createViewMutationApi({ viewRoot: view }).get({
        view: "unready",
        scope: [],
    });
    expect(unready.describe().dataReady).toBe(false);
    expect(() => unready.readData({ limit: 1 })).toThrow("not ready");
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
            const handle = api.get({ view: "track", scope: [] });
            expect(handle.readData({ limit: 1 }).rows).toHaveLength(1);

            if (state === "removed") {
                await /** @type {import("./layerView.js").default} */ (
                    view
                ).removeChildAt(0);
            } else {
                active = false;
            }

            for (const read of [
                () => handle.describe(),
                () => handle.readData({ limit: 1 }),
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

test("returns existing unnamed scales, absent scales, and rejects invalid channels", async () => {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const api = createViewMutationApi({ viewRoot: view });
    const handle = api.get({ view: "track", scope: [] });
    expect(handle.getScaleResolution("x")).toBe(view.getScaleResolution("x"));
    expect(handle.getScaleResolution("x")).toBeDefined();
    expect(handle.getScaleResolution("y")).toBeUndefined();
    for (const channel of ["color", undefined]) {
        expect(() =>
            handle.getScaleResolution(/** @type {any} */ (channel))
        ).toThrow("Expected positional channel");
    }
});

test("non-cloneable returned values reject without modifying source data", async () => {
    const { view } = await createHeadlessEngine({
        name: "track",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    });
    const handle = createViewMutationApi({ viewRoot: view }).get({
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
    expect(handle.describe().dataReady).toBe(true);
    // An empty read only looks ahead; it does not clone the unreturned datum.
    expect(handle.readData({ limit: 0 }).truncated).toBe(true);
    expect(() => handle.readData({ limit: 1 })).toThrow(
        expect.objectContaining({ name: "DataCloneError" })
    );
    expect(datum.callback).toBe(callback);
});

test.each(["A", "B"])(
    "reads only one collected facet batch (second group: %s)",
    async (group) => {
        // The sample encoding groups the terminal collector through normal dataflow.
        const { view } = await createHeadlessEngine({
            name: "track",
            data: {
                values: [
                    { x: 1, group: "A" },
                    { x: 2, group },
                ],
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                sample: { field: "group" },
            },
        });
        const handle = createViewMutationApi({ viewRoot: view }).get({
            view: "track",
            scope: [],
        });
        expect(handle.describe().dataReady).toBe(true);
        if (group === "A") {
            expect(handle.readData({ limit: 2 }).rows).toEqual([
                { x: 1, group: "A" },
                { x: 2, group: "A" },
            ]);
        } else {
            expect(() => handle.readData({ limit: 1 })).toThrow(
                "Faceted data reads are not supported"
            );
        }
    }
);

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
        const handle = await setup([{ x: 1, payload: wrap(buffer) }]);

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
    const handle = await setup([{ x: 1, payload }]);

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
        const handle = await setup([{ x: 1, payload }]);
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
    const handle = createViewMutationApi({ viewRoot: view }).root();
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
    const handle = await setup([{ x: 1, payload }]);

    expect(() => handle.readData({ limit: 1 })).toThrow("Shared memory");
});
