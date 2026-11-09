import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { expect, onTestFinished, test, vi } from "vitest";

import {
    createHeadlessEngine,
    createHeadlessViewContext,
} from "../genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "../view/viewMutationApi.js";
import { isDataReady } from "./dataReadiness.js";
import { UNIQUE_ID_KEY } from "./transforms/identifier.js";

/**
 * @param {import("../spec/data.js").Data} [data]
 * @param {string} [name]
 * @returns {import("../spec/view.js").UnitSpec}
 */
function producer(data = { name: "input" }, name = "summary") {
    return {
        name: "producer",
        visible: false,
        params: [{ name: "factor", value: 2 }],
        data,
        transform: [
            {
                type: "formula",
                expr: "datum.value * factor",
                as: "scaled",
            },
            { type: "identifier" },
            { type: "publish", dataset: { name, push: "outer" } },
            {
                type: "formula",
                expr: "datum.scaled + 100",
                as: "scaled",
            },
        ],
        mark: "point",
    };
}

/** @type {import("../spec/view.js").UnitSpec} */
const directReader = {
    name: "direct",
    data: { name: "summary" },
    mark: "point",
};

/** @type {import("../spec/view.js").UnitSpec} */
const lookupReader = {
    name: "lookup",
    data: { values: [{ key: "A" }] },
    transform: [
        {
            type: "lookup",
            from: { name: "summary" },
            key: "key",
            values: ["scaled", UNIQUE_ID_KEY],
            as: ["scaled", "producerId"],
        },
    ],
    mark: "point",
};

const contextOptions = {
    isViewConfiguredVisible: (
        /** @type {import("../view/view.js").default} */ view
    ) => view.isVisibleInSpec(),
};

/**
 * @param {import("../view/view.js").default} view
 * @param {string} name
 */
function child(view, name) {
    return view
        .getDescendants()
        .find((candidate) => candidate.explicitName === name);
}

/** @param {import("../view/view.js").default} view */
function rows(view) {
    return Array.from(view.flowHandle.collector.getData());
}

test.each([false, true])(
    "reads an asynchronous pushed table with producer first = %s",
    async (producerFirst) => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify([
                    { key: "A", value: 3 },
                    { key: "B", value: 4 },
                ])
            )
        );
        onTestFinished(() => fetch.mockRestore());
        const sourceSpec = producer({ url: "summary.json" });
        const readers = [
            structuredClone(directReader),
            structuredClone(lookupReader),
        ];
        const { view, context } = await createHeadlessEngine(
            {
                datasets: { summary: { derived: true } },
                vconcat: producerFirst
                    ? [sourceSpec, ...readers]
                    : [...readers, sourceSpec],
            },
            { contextOptions }
        );
        onTestFinished(() => {
            view.disposeSubtree();
            expect(context.dataFlow.collectors).toHaveLength(0);
        });

        const direct = child(view, "direct");
        const lookup = child(view, "lookup");
        const publisher = child(view, "producer");
        const source = publisher.flowHandle.dataSource;
        expect(rows(publisher).map((row) => row.scaled)).toEqual([106, 108]);
        expect(rows(direct).map((row) => row.scaled)).toEqual([6, 8]);
        const [{ scaled, producerId }] = rows(lookup);
        expect(scaled).toBe(6);
        expect(Number.isSafeInteger(producerId)).toBe(true);
        // Reader identities should be independent of whether the producer is already wired.
        const ids = rows(direct).map((row) => row[UNIQUE_ID_KEY]);
        expect(ids.every(Number.isSafeInteger)).toBe(true);
        expect(new Set(ids).size).toBe(2);
        expect(ids).not.toContain(producerId);
        const ready = () =>
            [direct, lookup].map((reader) =>
                isDataReady(reader.flowHandle.collector)
            );
        expect(ready()).toEqual([true, true]);

        const error = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        onTestFinished(() => error.mockRestore());
        fetch.mockResolvedValueOnce(
            new Response("unavailable", { status: 503 })
        );
        const pending = source.load();
        expect(ready()).toEqual([false, false]);
        await pending;
        expect(ready()).toEqual([false, false]);

        fetch.mockResolvedValueOnce(
            new Response(JSON.stringify([{ key: "A", value: 5 }]))
        );
        await source.load();
        await view.paramRuntime.whenPropagated();
        expect(ready()).toEqual([true, true]);
        expect(rows(direct).map((row) => row.scaled)).toEqual([10]);
        expect(rows(lookup).map((row) => row.scaled)).toEqual([10]);
    }
);

test("updates pushed readers while their producer is hidden and preserves their owner", async () => {
    const { view, context } = await createHeadlessEngine(
        {
            datasets: {
                input: [{ key: "A", value: 3 }],
                summary: { derived: true },
                unclaimed: { derived: true },
            },
            vconcat: [
                structuredClone(directReader),
                structuredClone(lookupReader),
                producer(),
            ],
        },
        { contextOptions }
    );
    const api = createViewMutationApi({ viewRoot: view });
    const owner = api.root();
    const producerHandle = api.get({ scope: [], view: "producer" });
    const direct = child(view, "direct");
    const lookup = child(view, "lookup");
    const snapshot = () =>
        [rows(direct), rows(lookup)].map((data) =>
            data.map((row) => row.scaled)
        );

    try {
        expect(snapshot()).toEqual([[6], [6]]);
        producerHandle.params.get("factor").setValue(3);
        await view.paramRuntime.whenPropagated();
        expect(snapshot()).toEqual([[9], [9]]);

        owner.datasets.set("input", []);
        await view.paramRuntime.whenPropagated();
        expect(snapshot()).toEqual([[], [null]]);
        expect(isDataReady(direct.flowHandle.collector)).toBe(true);
        expect(isDataReady(lookup.flowHandle.collector)).toBe(true);

        const replacement = tableToIPC(
            tableFromArrays({ key: ["A"], value: [4] }),
            { format: "stream" }
        );
        await owner.datasets.load("input", replacement, { type: "arrow" });
        await view.paramRuntime.whenPropagated();
        expect(snapshot()).toEqual([[12], [12]]);
        expect(() => owner.datasets.set("summary", [])).toThrow(/read.only/i);

        const late = await api.insert(owner, {
            ...structuredClone(directReader),
            name: "late",
        });
        expect(rows(child(view, "late")).map((row) => row.scaled)).toEqual([
            12,
        ]);
        await expect(
            api.insert(owner, producer({ values: [] }, "unclaimed"))
        ).rejects.toThrow(/configured/i);
        await expect(api.remove(producerHandle)).rejects.toThrow(
            /owner survives/i
        );
        expect(producerHandle.isAlive()).toBe(true);

        await api.remove(late);
        await api.remove(api.get({ scope: [], view: "direct" }));
        owner.datasets.reset("input");
        await view.paramRuntime.whenPropagated();
        expect(rows(lookup).map((row) => row.scaled)).toEqual([9]);
    } finally {
        view.disposeSubtree();
    }
    expect(context.dataFlow.dataSources).toHaveLength(0);
    expect(context.dataFlow.collectors).toHaveLength(0);
});

// Exercise failure after attaching to a borrowed table and before attaching to a new source.
test.each([
    {
        name: "summary",
        prefix: [
            {
                type: /** @type {const} */ ("formula"),
                expr: "datum.scaled + 1",
                as: "shifted",
            },
        ],
    },
    { name: "input", prefix: [] },
])(
    "a failed reader insertion from $name leaves the published table usable",
    async ({ name, prefix }) => {
        const { view, context } = await createHeadlessEngine(
            {
                datasets: {
                    input: [{ key: "A", value: 3 }],
                    summary: { derived: true },
                    unclaimed: { derived: true },
                },
                vconcat: [producer(), structuredClone(directReader)],
            },
            { contextOptions }
        );
        onTestFinished(() => view.disposeSubtree());
        const api = createViewMutationApi({ viewRoot: view });
        const owner = api.root();

        const originalSource =
            context.dataFlow.findNamedDataSource("input").dataSource;
        await expect(
            api.insert(owner, {
                data: { name },
                transform: [
                    ...prefix,
                    {
                        type: "lookup",
                        from: { name: "unclaimed" },
                        key: "key",
                        values: ["scaled"],
                    },
                ],
                mark: "point",
            })
        ).rejects.toThrow(/unclaimed.*no producer/i);

        expect(context.dataFlow.findNamedDataSource("input").dataSource).toBe(
            originalSource
        );
        owner.datasets.set("input", [{ key: "A", value: 4 }]);
        await view.paramRuntime.whenPropagated();
        expect(rows(child(view, "direct")).map((row) => row.scaled)).toEqual([
            8,
        ]);
    }
);

test("rejects a dependency cycle through a lookup of the pushed table", async () => {
    const source = producer({ values: [{ key: "A", value: 3 }] });
    source.transform.unshift(structuredClone(lookupReader.transform[0]));
    await expect(
        createHeadlessEngine({
            datasets: { summary: { derived: true } },
            vconcat: [source],
        })
    ).rejects.toThrow(/cycl(?:e|ic)/i);
});

test("rejects duplicate and shadowed claims and reads of unclaimed slots", async () => {
    const source = producer({ values: [{ key: "A", value: 3 }] });
    await expect(
        createHeadlessEngine({
            datasets: { summary: { derived: true } },
            vconcat: [
                source,
                { ...structuredClone(source), name: "duplicate" },
            ],
        })
    ).rejects.toThrow(/duplicate|already.*producer/i);
    await expect(
        createHeadlessEngine({
            datasets: { summary: { derived: true } },
            vconcat: [{ datasets: { summary: [] }, vconcat: [source] }],
        })
    ).rejects.toThrow(/summary.*(?:slot|derived)/i);
    await expect(
        createHeadlessEngine({
            datasets: { summary: { derived: true } },
            vconcat: [structuredClone(directReader)],
        })
    ).rejects.toThrow(/summary.*no producer/i);
});

test("failed construction and wiring release a claim on an unconfigured ancestor", async () => {
    const context = createHeadlessViewContext();
    const owner = /** @type {import("../view/concatView.js").default} */ (
        await context.createOrImportView(
            {
                datasets: { summary: { derived: true } },
                vconcat: [],
            },
            null,
            null,
            "owner"
        )
    );
    onTestFinished(() => owner.disposeSubtree());
    const source = producer({ values: [{ key: "A", value: 3 }] });
    await expect(
        owner.addChildSpec({
            vconcat: [source, { mark: /** @type {any} */ ("nope") }],
        })
    ).rejects.toThrow("No such mark: nope");

    await expect(
        owner.addChildSpec({
            vconcat: [
                structuredClone(directReader),
                producer({ name: "summary" }),
            ],
        })
    ).rejects.toThrow(/dependency cycle/i);
    expect(owner.children).toHaveLength(0);
    expect(context.dataFlow.collectors).toHaveLength(0);

    const valid = await owner.addChildSpec({
        vconcat: [
            structuredClone(directReader),
            producer({ values: [{ key: "A", value: 4 }] }),
        ],
    });
    expect(rows(child(valid, "direct")).map((row) => row.scaled)).toEqual([8]);
});
