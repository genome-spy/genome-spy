import { getEncodingKeyFields } from "@genome-spy/core/encoder/metadataChannels.js";

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("@genome-spy/core/data/flowNode.js").Datum} Datum
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("./paramProvenanceTypes.d.ts").PointExpandOrigin} PointExpandOrigin
 * @typedef {{ completed: boolean, findDatumByKey: (keyFields: string[], keyTuple: Scalar[]) => Datum | undefined }} PointExpandOriginCollector
 * @typedef {{ getCollector?: () => PointExpandOriginCollector | undefined }} PointExpandOriginCollectorProvider
 *
 * @typedef {{ reason: "ok", keyFields: string[], datum: Datum | undefined } | { reason: "missingCollector" } | { reason: "collectorNotCompleted", collector: PointExpandOriginCollector } | { reason: "invalidOriginKeyTuple" | "missingEncodingKey" | "incompatibleOriginKeyTuple" } | { reason: "legacyKeyFieldsMismatch", keyFields: string[], legacyKeyFields: string[] } | { reason: "lookupError", error: unknown }} PointExpandOriginResolution
 */

/**
 * Resolves expansion origin key fields and origin datum in one step.
 *
 * @param {View} originView
 * @param {PointExpandOrigin} origin
 * @returns {PointExpandOriginResolution}
 */
export function tryResolvePointExpandOriginDatum(originView, origin) {
    const collectorProvider =
        /** @type {PointExpandOriginCollectorProvider} */ (originView);
    const collector = collectorProvider.getCollector?.();
    if (!collector) {
        return { reason: "missingCollector" };
    }

    if (!collector.completed) {
        return { reason: "collectorNotCompleted", collector };
    }

    if (!Array.isArray(origin.keyTuple) || origin.keyTuple.length === 0) {
        return { reason: "invalidOriginKeyTuple" };
    }

    let keyFields;
    try {
        keyFields = getEncodingKeyFields(originView.getEncoding());
    } catch (_error) {
        return { reason: "missingEncodingKey" };
    }

    if (!keyFields.length || keyFields.length !== origin.keyTuple.length) {
        return { reason: "incompatibleOriginKeyTuple" };
    }

    if (
        Array.isArray(origin.keyFields) &&
        (origin.keyFields.length !== keyFields.length ||
            origin.keyFields.some((fieldName, i) => fieldName !== keyFields[i]))
    ) {
        return {
            reason: "legacyKeyFieldsMismatch",
            keyFields,
            legacyKeyFields: origin.keyFields,
        };
    }

    try {
        return {
            reason: "ok",
            keyFields,
            datum: collector.findDatumByKey(keyFields, origin.keyTuple),
        };
    } catch (error) {
        return { reason: "lookupError", error };
    }
}
