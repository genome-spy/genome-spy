import { subscribeTo } from "../../state/subscribeTo.js";
import { sampleSlice } from "../state/sampleSlice.js";
import { resetProvenanceHistory } from "../../state/provenanceBaseline.js";
import { AUGMENTED_KEY } from "../../state/provenanceReducerBuilder.js";
import {
    createMetadataSourceAdapter,
    resolveMetadataSources,
} from "./metadataSourceAdapters.js";
import {
    chunkInitialLoadColumns,
    getEffectiveInitialLoad,
    resolveInitialLoadColumnIds,
} from "./metadataSourceInitialLoad.js";

/**
 * @param {import("../sampleView.js").default} sampleView
 * @returns {Promise<string[]>}
 */
async function awaitSampleIds(sampleView) {
    const sampleIds = sampleView.sampleHierarchy.sampleData?.ids;
    if (sampleIds && sampleIds.length > 0) {
        return sampleIds;
    }

    await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            unsubscribe();
            reject(
                new Error("Timed out while waiting for sample identifiers.")
            );
        }, 10000);

        const unsubscribe = subscribeTo(
            sampleView.provenance.store,
            () => sampleView.sampleHierarchy.sampleData?.ids,
            (ids) => {
                if (!ids || ids.length === 0) {
                    return;
                }

                clearTimeout(timeoutId);
                unsubscribe();
                resolve(undefined);
            }
        );
    });

    return (
        sampleView.sampleHierarchy.sampleData?.ids ??
        /** @type {string[]} */ ([])
    );
}

/**
 * Loads metadata source attributes configured for startup.
 *
 * @param {import("../sampleView.js").default} sampleView
 * @param {import("../../state/intentPipeline.js").default} intentPipeline
 */
export async function bootstrapInitialMetadataSources(
    sampleView,
    intentPipeline
) {
    const sources = await resolveMetadataSources(sampleView.spec.samples, {
        baseUrl: sampleView.getBaseUrl(),
    });
    if (sources.length === 0) {
        return;
    }

    const sampleIds = await awaitSampleIds(sampleView);
    if (sampleIds.length === 0) {
        throw new Error("No sample identifiers are available for metadata.");
    }

    /** @type {import("@reduxjs/toolkit").Action[]} */
    const actions = [];
    let replace = true;

    for (const source of sources) {
        const initialLoad = getEffectiveInitialLoad(source);
        if (initialLoad === false) {
            continue;
        }

        const adapter = createMetadataSourceAdapter(source, {
            baseUrl: sampleView.getBaseUrl(),
        });
        const columnIds = await resolveInitialLoadColumnIds(source, adapter);
        const chunks = chunkInitialLoadColumns(columnIds);

        for (const chunk of chunks) {
            const metadata = await adapter.fetchColumns({
                columnIds: chunk,
                sampleIds,
                replace,
            });

            /** @type {import("../state/payloadTypes.js").AddMetadataFromSource} */
            const payload = {
                columnIds: chunk,
                replace,
                [AUGMENTED_KEY]: {
                    metadata,
                },
            };

            if (source.id) {
                payload.sourceId = source.id;
            }

            actions.push(sampleSlice.actions.addMetadataFromSource(payload));
            replace = false;
        }
    }

    if (actions.length === 0) {
        return;
    }

    await intentPipeline.submit(actions);
    resetProvenanceHistory(sampleView.provenance.store, sampleSlice.name);
}
