import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import {
    createMetadataSourceAdapter,
    MAX_METADATA_SOURCE_COLUMNS,
} from "./metadataSourceAdapters.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} MetadataSourceDef
 * @typedef {import("../state/payloadTypes.js").AddMetadataFromSource} AddMetadataFromSource
 */

/**
 * Resolves/fetches source metadata and stores it in `_augmented`.
 *
 * @param {{
 *   source: MetadataSourceDef;
 *   payload: AddMetadataFromSource;
 *   sampleIds: string[];
 *   baseUrl?: string;
 *   signal?: AbortSignal;
 *   adapter?: {
 *     resolveColumns: (queries: string[], signal?: AbortSignal) => Promise<{ columnIds: string[] }>;
 *     fetchColumns: (request: { columnIds: string[]; sampleIds: string[]; groupPath?: string; replace?: boolean }, signal?: AbortSignal) => Promise<import("../state/payloadTypes.js").SetMetadata>;
 *   };
 *   resolveColumns?: boolean;
 * }} params
 * @returns {Promise<AddMetadataFromSource>}
 */
export async function augmentMetadataSourcePayload(params) {
    const {
        source,
        payload,
        sampleIds,
        baseUrl,
        signal,
        adapter,
        resolveColumns = true,
    } = params;

    if (payload[AUGMENTED_KEY]?.metadata) {
        return payload;
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

    const sourceAdapter =
        adapter ??
        createMetadataSourceAdapter(source, {
            baseUrl,
        });

    let columnIds = payload.columnIds;
    if (resolveColumns) {
        const resolved = await sourceAdapter.resolveColumns(columnIds, signal);
        if (resolved.columnIds.length === 0) {
            throw new Error("No resolvable metadata columns were found.");
        }
        columnIds = resolved.columnIds;
    }

    const metadata = await sourceAdapter.fetchColumns(
        {
            columnIds,
            sampleIds,
            groupPath: payload.groupPath,
            replace: payload.replace,
        },
        signal
    );

    return {
        ...payload,
        [AUGMENTED_KEY]: {
            metadata,
        },
    };
}
