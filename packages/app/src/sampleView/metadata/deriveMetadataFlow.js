import { showDerivedMetadataDialog } from "./derivedMetadataDialog.js";
import {
    buildDerivedMetadataIntent,
    createDerivedAttributeName,
} from "./deriveMetadataUtils.js";

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView.js").default} sampleView
 */
export async function handleAddToMetadata(
    attributeInfo,
    sampleHierarchy,
    sampleView
) {
    if (!sampleHierarchy.sampleData) {
        throw new Error("Sample data has not been initialized.");
    }

    const attributeName = createDerivedAttributeName(
        attributeInfo,
        sampleHierarchy.sampleMetadata.attributeNames
    );
    const sampleIds = sampleHierarchy.sampleData.ids;
    const values = attributeInfo.valuesProvider({
        sampleIds,
        sampleHierarchy,
    });

    if (values.length !== sampleIds.length) {
        throw new Error(
            "Derived metadata values length does not match sample ids."
        );
    }

    const result = await showDerivedMetadataDialog({
        attributeInfo,
        sampleIds,
        values,
        existingAttributeNames: sampleHierarchy.sampleMetadata.attributeNames,
        defaultName: attributeName,
    });

    if (result.ok) {
        const config =
            /** @type {{ name: string, groupPath: string, scale?: import("@genome-spy/core/spec/scale.js").Scale }} */ (
                result.data
            );
        sampleView.intentExecutor.dispatch(
            sampleView.actions.deriveMetadata(
                buildDerivedMetadataIntent(attributeInfo.attribute, config)
            )
        );
    }
}
