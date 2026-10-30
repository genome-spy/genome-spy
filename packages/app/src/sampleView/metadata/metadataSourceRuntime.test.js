import { expect, test, vi } from "vitest";
import setupStore from "../../state/setupStore.js";
import IntentExecutor from "../../state/intentExecutor.js";
import IntentPipeline from "../../state/intentPipeline.js";
import Provenance from "../../state/provenance.js";
import { sampleSlice } from "../state/sampleSlice.js";
import { setupMetadataSourceRuntime } from "./metadataSourceRuntime.js";

test("detachment releases metadata hooks and the attribute resolver", async () => {
    const store = setupStore();
    store.dispatch(
        sampleSlice.actions.setSamples({
            samples: [{ id: "s1", displayName: "Sample", indexNumber: 0 }],
        })
    );
    const pipeline = new IntentPipeline({
        store,
        provenance: new Provenance(store),
        intentExecutor: new IntentExecutor(store),
    });
    /** @type {(() => void)[]} */
    const disposers = [];
    const awaitMetadataReady = vi.fn(async () => {});
    const sampleView = /** @type {import("../sampleView.js").default} */ (
        /** @type {unknown} */ ({
            spec: { metadata: { sources: [] } },
            compositeAttributeInfoSource: { getAttributeInfo: vi.fn() },
            getBaseUrl: () => undefined,
            registerDisposer: (/** @type {() => void} */ dispose) =>
                disposers.push(dispose),
            awaitMetadataReady,
        })
    );
    await setupMetadataSourceRuntime(sampleView, pipeline);
    expect(pipeline.createContext().getAttributeInfo).toBeTypeOf("function");

    const action = sampleSlice.actions.addMetadata({
        columnarMetadata: { sample: ["s1"], status: ["A"] },
        replace: true,
    });
    await pipeline.submit(action);
    expect(awaitMetadataReady).toHaveBeenCalledOnce();

    for (const dispose of disposers) {
        dispose();
    }
    expect(pipeline.createContext().getAttributeInfo).toBeUndefined();
    await pipeline.submit(action);
    expect(awaitMetadataReady).toHaveBeenCalledOnce();
});
