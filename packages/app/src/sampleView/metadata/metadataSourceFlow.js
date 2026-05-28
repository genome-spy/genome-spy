import { augmentMetadataSourcePayload } from "./metadataSourcePayloadAugmentation.js";
import { getMetadataSourceRuntime } from "./metadataSourceRuntimeState.js";

/**
 * @param {import("@reduxjs/toolkit").Action} action
 * @param {import("../sampleView.js").default} sampleView
 * @param {AbortSignal} [signal]
 * @returns {Promise<import("@reduxjs/toolkit").Action>}
 */
export async function augmentAddMetadataFromSourceAction(
    action,
    sampleView,
    signal
) {
    if (action.type !== sampleView.actions.addMetadataFromSource.type) {
        return action;
    }

    if (!("payload" in action)) {
        throw new Error("Metadata source action payload is missing.");
    }

    const payload =
        /** @type {import("../state/payloadTypes.js").AddMetadataFromSource} */ (
            action.payload
        );

    const sampleIds = sampleView.sampleHierarchy.sampleData?.ids;
    if (!sampleIds) {
        throw new Error("Sample data has not been initialized.");
    }

    const runtime = getMetadataSourceRuntime(sampleView);
    const source = await runtime.getSource(payload.sourceId);
    const augmentedPayload = await augmentMetadataSourcePayload({
        source,
        payload,
        sampleIds,
        adapter: runtime.getAdapter(source),
        signal,
    });

    return /** @type {import("@reduxjs/toolkit").Action} */ ({
        ...action,
        payload: augmentedPayload,
    });
}
