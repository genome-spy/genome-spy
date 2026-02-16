import { resolveMetadataSource } from "./metadataSourceAdapters.js";
import { augmentMetadataSourcePayload } from "./metadataSourcePayloadAugmentation.js";

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

    const source = await resolveMetadataSource(
        sampleView.spec.samples,
        payload.sourceId,
        {
            baseUrl: sampleView.getBaseUrl(),
            signal,
        }
    );
    const augmentedPayload = await augmentMetadataSourcePayload({
        source,
        payload,
        sampleIds,
        baseUrl: sampleView.getBaseUrl(),
        signal,
    });

    return /** @type {import("@reduxjs/toolkit").Action} */ ({
        ...action,
        payload: augmentedPayload,
    });
}
