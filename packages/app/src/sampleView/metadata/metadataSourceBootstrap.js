import { sampleSlice } from "../state/sampleSlice.js";
import { resetProvenanceHistory } from "../../state/provenanceBaseline.js";
import {
    chunkInitialLoadColumns,
    getEffectiveInitialLoad,
    resolveInitialLoadColumnIds,
} from "./metadataSourceInitialLoad.js";
import { augmentMetadataSourcePayload } from "./metadataSourcePayloadAugmentation.js";
import { getMetadataSourceRuntime } from "./metadataSourceRuntimeState.js";

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
    const runtime = getMetadataSourceRuntime(sampleView);
    const sources = await runtime.getSources();
    if (sampleView.disposed || sources.length === 0) {
        return;
    }

    // App attaches metadata after Core or ensureSampleIdentity has loaded ids.
    const sampleIds = sampleView.sampleHierarchy.sampleData?.ids;
    if (!sampleIds) {
        throw new Error(
            "Sample identities must be loaded before metadata bootstrap."
        );
    }
    if (sampleIds.length === 0) {
        return;
    }

    /** @type {import("@reduxjs/toolkit").Action[]} */
    const actions = [];
    let replace = true;

    for (const source of sources) {
        if (getEffectiveInitialLoad(source) === false) {
            continue;
        }
        const adapter = await runtime.getAdapter(source);
        if (sampleView.disposed) {
            return;
        }
        const columnIds = await resolveInitialLoadColumnIds(source, adapter);
        if (sampleView.disposed) {
            return;
        }
        if (columnIds.length === 0) {
            continue;
        }
        const chunks = chunkInitialLoadColumns(columnIds);

        for (const chunk of chunks) {
            /** @type {import("../state/payloadTypes.js").AddMetadataFromSource} */
            const rawPayload = {
                columnIds: chunk,
                replace,
            };

            if (source.id) {
                rawPayload.sourceId = source.id;
            }

            const payload = await augmentMetadataSourcePayload({
                source,
                payload: rawPayload,
                sampleIds,
                adapter,
                resolveColumns: false,
            });
            if (sampleView.disposed) {
                return;
            }

            actions.push(sampleSlice.actions.addMetadataFromSource(payload));
            replace = false;
        }
    }

    if (actions.length === 0) {
        return;
    }

    await intentPipeline.submit(actions);
    if (!sampleView.disposed) {
        resetProvenanceHistory(sampleView.provenance.store, sampleSlice.name);
    }
}
