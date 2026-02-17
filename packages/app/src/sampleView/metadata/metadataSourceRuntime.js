import { sampleSlice } from "../state/sampleSlice.js";
import { augmentAddMetadataFromSourceAction } from "./metadataSourceFlow.js";
import { bootstrapInitialMetadataSources } from "./metadataSourceBootstrap.js";

/**
 * Configures metadata-source action hooks and eager metadata bootstrap.
 *
 * @param {import("../sampleView.js").default} sampleView
 * @param {import("../../state/intentPipeline.js").default} intentPipeline
 */
export async function setupMetadataSourceRuntime(sampleView, intentPipeline) {
    intentPipeline.setResolvers({
        getAttributeInfo:
            sampleView.compositeAttributeInfoSource.getAttributeInfo.bind(
                sampleView.compositeAttributeInfoSource
            ),
    });

    const unregisterMetadataReadyHook = intentPipeline.registerActionHook({
        predicate: (action) =>
            action.type === sampleSlice.actions.addMetadata.type ||
            action.type === sampleSlice.actions.deriveMetadata.type ||
            action.type === sampleSlice.actions.addMetadataFromSource.type,
        awaitProcessed: (context) =>
            sampleView.awaitMetadataReady(context.signal),
    });

    const unregisterMetadataSourceAugmenter = intentPipeline.registerActionHook(
        {
            predicate: (action) =>
                action.type === sampleSlice.actions.addMetadataFromSource.type,
            augment: (context, action) =>
                augmentAddMetadataFromSourceAction(
                    action,
                    sampleView,
                    context.signal
                ),
        }
    );

    sampleView.registerDisposer(unregisterMetadataReadyHook);
    sampleView.registerDisposer(unregisterMetadataSourceAugmenter);

    await bootstrapInitialMetadataSources(sampleView, intentPipeline);
}
