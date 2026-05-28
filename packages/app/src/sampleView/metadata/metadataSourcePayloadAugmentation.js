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
 *     resolveColumns: (queries: string[], signal?: AbortSignal) => Promise<{ columnIds: string[]; missing?: string[]; ambiguous?: string[] }>;
 *     fetchColumns: (request: { columnIds: string[]; sampleIds: string[]; groupPath?: string; replace?: boolean }, signal?: AbortSignal) => Promise<import("../state/payloadTypes.js").SetMetadata>;
 *   } | import("./metadataSourceAdapters.js").MetadataSourceAdapter;
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
            throw new Error(formatUnresolvedColumnsError(source, resolved));
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

/**
 * @param {MetadataSourceDef} source
 * @param {{ missing?: string[]; ambiguous?: string[] }} resolved
 * @returns {string}
 */
function formatUnresolvedColumnsError(source, resolved) {
    const sourceLabel = source.id ?? source.name ?? "(unnamed source)";
    const unresolved = [
        ...(resolved.missing ?? []),
        ...(resolved.ambiguous ?? []),
    ];
    const detail =
        unresolved.length > 0 ? ": " + unresolved.join(", ") + "." : ".";

    return (
        "None of the requested metadata columns could be resolved from source " +
        '"' +
        sourceLabel +
        '"' +
        detail
    );
}
