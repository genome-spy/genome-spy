import { describe, expect, it, vi } from "vitest";
import IntentPipeline from "./intentPipeline.js";

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
    return {
        store: {},
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
});
