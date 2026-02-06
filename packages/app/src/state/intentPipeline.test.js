import { describe, expect, it, vi } from "vitest";
import IntentPipeline from "./intentPipeline.js";
import { intentStatusSlice } from "./intentStatusSlice.js";

/**
 * @returns {{resolve: () => void, reject: (error: Error) => void, promise: Promise<void>}}
 */
function createDeferred() {
    /** @type {() => void} */
    let resolve;
    /** @type {(error: Error) => void} */
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { resolve, reject, promise };
}

/**
 * @returns {{store: any, provenance: any, intentExecutor: any}}
 */
function createDeps() {
    /** @type {any[]} */
    const past = [];
    return {
        store: {
            getState: () => ({
                provenance: { past },
            }),
            dispatch: vi.fn((action) => {
                if (
                    action.type.startsWith("sample/") ||
                    action.type === "sample/no-attr"
                ) {
                    past.push(action);
                }
                return action;
            }),
        },
        provenance: {},
        intentExecutor: {
            dispatch: vi.fn((action) => action),
        },
    };
}

describe("IntentPipeline", () => {
    it("processes actions sequentially and resolves submissions", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const ensureDeferred = createDeferred();
        const processedDeferred = createDeferred();

        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: () => ensureDeferred.promise,
            awaitProcessed: () => processedDeferred.promise,
        };

        const getAttributeInfo = () => attributeInfo;

        const submitPromise = pipeline.submit(
            { type: "sample/action", payload: { attribute: { type: "test" } } },
            { getAttributeInfo }
        );

        expect(deps.intentExecutor.dispatch).not.toHaveBeenCalled();

        ensureDeferred.resolve();
        await Promise.resolve();

        expect(deps.intentExecutor.dispatch).toHaveBeenCalledTimes(1);
        processedDeferred.resolve();

        await submitPromise;
    });

    it("queues single actions and rejects batches while running", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const ensureDeferred = createDeferred();
        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: () => ensureDeferred.promise,
        };

        const getAttributeInfo = () => attributeInfo;

        const first = pipeline.submit(
            { type: "sample/one", payload: { attribute: { type: "test" } } },
            { getAttributeInfo }
        );
        const second = pipeline.submit(
            { type: "sample/two", payload: { attribute: { type: "test" } } },
            { getAttributeInfo }
        );

        await expect(
            pipeline.submit(
                [{ type: "sample/three" }, { type: "sample/four" }],
                { getAttributeInfo }
            )
        ).rejects.toThrow("Cannot submit a batch while actions are running.");

        ensureDeferred.resolve();
        await first;
        await second;
        expect(deps.intentExecutor.dispatch).toHaveBeenCalledTimes(2);
    });

    it("rejects submissions while a batch is running", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const ensureDeferred = createDeferred();
        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: () => ensureDeferred.promise,
        };
        const getAttributeInfo = () => attributeInfo;

        const batchPromise = pipeline.submit(
            [
                {
                    type: "sample/one",
                    payload: { attribute: { type: "test" } },
                },
                {
                    type: "sample/two",
                    payload: { attribute: { type: "test" } },
                },
            ],
            { getAttributeInfo }
        );

        await expect(
            pipeline.submit({ type: "sample/three" }, { getAttributeInfo })
        ).rejects.toThrow("Cannot submit actions while a batch is running.");

        ensureDeferred.resolve();
        await batchPromise;
    });

    it("rejects queued submissions after a processing failure", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const ensureDeferred = createDeferred();
        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: () => ensureDeferred.promise,
        };
        const getAttributeInfo = () => attributeInfo;

        const first = pipeline.submit(
            { type: "sample/one", payload: { attribute: { type: "test" } } },
            { getAttributeInfo }
        );
        const second = pipeline.submit(
            { type: "sample/two", payload: { attribute: { type: "test" } } },
            { getAttributeInfo }
        );

        ensureDeferred.reject(new Error("Boom"));

        await expect(first).rejects.toThrow("Boom");
        await expect(second).rejects.toThrow("Boom");
    });

    it("rejects and skips dispatch when ensureAvailability fails", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: () =>
                Promise.reject(
                    new Error(
                        'Cannot resolve interval source selection "brush".'
                    )
                ),
        };
        const getAttributeInfo = () => attributeInfo;

        await expect(
            pipeline.submit(
                {
                    type: "sample/sortBy",
                    payload: { attribute: { type: "test" } },
                },
                { getAttributeInfo }
            )
        ).rejects.toThrow('Cannot resolve interval source selection "brush".');

        expect(deps.intentExecutor.dispatch).not.toHaveBeenCalled();
    });

    it("dispatches actions without attributes", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const submitPromise = pipeline.submit({ type: "sample/no-attr" }, {});

        await submitPromise;
        expect(deps.intentExecutor.dispatch).toHaveBeenCalledTimes(1);
    });

    it("processes batch actions sequentially with ensure ordering", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const firstEnsure = createDeferred();
        const secondEnsure = createDeferred();
        /** @type {number} */
        let ensureCalls = 0;

        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: () => {
                ensureCalls += 1;
                // Non-obvious: staged promises ensure the second action waits.
                return ensureCalls === 1
                    ? firstEnsure.promise
                    : secondEnsure.promise;
            },
        };
        const getAttributeInfo = () => attributeInfo;

        const batchPromise = pipeline.submit(
            [
                {
                    type: "sample/one",
                    payload: { attribute: { type: "test" } },
                },
                {
                    type: "sample/two",
                    payload: { attribute: { type: "test" } },
                },
            ],
            { getAttributeInfo }
        );

        expect(deps.intentExecutor.dispatch).not.toHaveBeenCalled();
        firstEnsure.resolve();
        await Promise.resolve();
        expect(deps.intentExecutor.dispatch).toHaveBeenCalledTimes(1);

        secondEnsure.resolve();
        await batchPromise;
        expect(deps.intentExecutor.dispatch).toHaveBeenCalledTimes(2);
    });

    it("awaits action hooks before resolving submissions", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const ensureDeferred = createDeferred();
        const processedDeferred = createDeferred();
        // Track hook ordering relative to dispatch and submission resolution.
        /** @type {string[]} */
        const steps = [];

        pipeline.registerActionHook({
            predicate: (action) => action.type === "sample/hook",
            ensure: async () => {
                steps.push("ensure-start");
                await ensureDeferred.promise;
                steps.push("ensure-end");
            },
            awaitProcessed: async () => {
                steps.push("processed-start");
                await processedDeferred.promise;
                steps.push("processed-end");
            },
        });

        const submitPromise = pipeline.submit({ type: "sample/hook" }, {});

        await Promise.resolve();
        expect(deps.intentExecutor.dispatch).toHaveBeenCalledTimes(1);
        expect(steps).toEqual(["ensure-start"]);

        ensureDeferred.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(steps).toEqual([
            "ensure-start",
            "ensure-end",
            "processed-start",
        ]);

        processedDeferred.resolve();
        await submitPromise;
        expect(steps).toEqual([
            "ensure-start",
            "ensure-end",
            "processed-start",
            "processed-end",
        ]);
    });

    it("aborts in-flight work when abortCurrent is called", async () => {
        const deps = createDeps();
        const pipeline = new IntentPipeline(deps);

        const ensureStarted = createDeferred();
        const ensureDeferred = createDeferred();

        /** @type {import("../sampleView/types.js").AttributeInfo} */
        const attributeInfo = {
            name: "Test",
            attribute: { type: "test" },
            title: "Test",
            emphasizedName: "Test",
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
            ensureAvailability: ({ signal }) => {
                if (!signal) {
                    throw new Error("Missing abort signal");
                }
                signal.addEventListener(
                    "abort",
                    () => {
                        ensureDeferred.reject(new Error("Aborted by user"));
                    },
                    { once: true }
                );
                ensureStarted.resolve();
                return ensureDeferred.promise;
            },
        };
        const getAttributeInfo = () => attributeInfo;

        const submitPromise = pipeline.submit(
            { type: "sample/one", payload: { attribute: { type: "test" } } },
            { getAttributeInfo }
        );

        // Non-obvious: wait until ensureAvailability hooks the abort listener.
        await ensureStarted.promise;
        pipeline.abortCurrent();

        await expect(submitPromise).rejects.toThrow("Aborted by user");
        const errorActions = deps.store.dispatch.mock.calls
            .map(([action]) => action)
            .filter(
                (action) =>
                    action.type === intentStatusSlice.actions.setError.type
            );
        expect(errorActions).toHaveLength(1);
    });
});
