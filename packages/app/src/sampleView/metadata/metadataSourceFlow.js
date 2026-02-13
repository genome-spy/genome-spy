import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import {
    createMetadataSourceAdapter,
    MAX_METADATA_SOURCE_COLUMNS,
    resolveMetadataSource,
} from "./metadataSourceAdapters.js";

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

    if (payload[AUGMENTED_KEY]?.metadata) {
        return action;
    }

    const sampleIds = sampleView.sampleHierarchy.sampleData?.ids;
    if (!sampleIds) {
        throw new Error("Sample data has not been initialized.");
    }

    if (payload.columnIds.length === 0) {
        throw new Error("No metadata columns requested from source.");
    }

    if (payload.columnIds.length > MAX_METADATA_SOURCE_COLUMNS) {
        throw new Error(
            "Metadata import exceeds the column limit (" +
                String(MAX_METADATA_SOURCE_COLUMNS) +
                ")."
        );
    }

    const source = resolveMetadataSource(
        sampleView.spec.samples,
        payload.sourceId
    );
    const adapter = createMetadataSourceAdapter(source, {
        baseUrl: sampleView.getBaseUrl(),
    });

    const resolved = await adapter.resolveColumns(payload.columnIds, signal);
    if (resolved.missing.length > 0) {
        throw new Error(
            "Metadata source columns were not found: " +
                resolved.missing.join(", ")
        );
    }

    if (resolved.columnIds.length === 0) {
        throw new Error("No resolvable metadata columns were found.");
    }

    const metadata = await adapter.fetchColumns(
        {
            columnIds: resolved.columnIds,
            sampleIds,
            groupPath: payload.groupPath,
            replace: payload.replace,
        },
        signal
    );

    return /** @type {import("@reduxjs/toolkit").Action} */ ({
        ...action,
        payload: {
            ...payload,
            [AUGMENTED_KEY]: {
                metadata,
            },
        },
    });
}
