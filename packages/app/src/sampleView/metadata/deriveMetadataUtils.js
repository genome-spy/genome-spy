import {
    applyGroupToAttributeDefs,
    METADATA_PATH_SEPARATOR,
} from "./metadataUtils.js";
import emptyToUndefined from "../../utils/emptyToUndefined.js";
import { compressAttributeName } from "./derivedMetadataNameUtils.js";

/**
 * @typedef {import("@genome-spy/app/spec/sampleView.js").SampleAttributeType} SampleAttributeType
 */

/**
 * @param {import("../types.js").AttributeInfo | null} attributeInfo
 * @param {{ strict?: boolean }} [options]
 * @returns {SampleAttributeType | null}
 */
export function resolveDataType(attributeInfo, options = {}) {
    if (!attributeInfo) {
        throw new Error("Attribute info is missing.");
    }

    const dataType = /** @type {SampleAttributeType} */ (attributeInfo.type);
    if (
        dataType === "nominal" ||
        dataType === "ordinal" ||
        dataType === "quantitative"
    ) {
        return dataType;
    }

    if (options.strict === false) {
        return null;
    }

    throw new Error("Unsupported data type: " + dataType);
}

/**
 * @param {string} attributeNameRaw
 * @param {string} groupPathRaw
 * @param {string[]} existingNames
 * @param {import("../types.js").AttributeInfo | null} attributeInfo
 * @returns {string | null}
 */
export function validateDerivedMetadataName(
    attributeNameRaw,
    groupPathRaw,
    existingNames,
    attributeInfo
) {
    const attributeName = attributeNameRaw.trim();
    if (attributeName.length === 0) {
        return "Attribute name is required.";
    }

    const groupPath = groupPathRaw.trim();
    const derivedName = deriveAttributeName(
        attributeName,
        groupPath,
        resolveDataType(attributeInfo)
    );
    if (existingNames.includes(derivedName)) {
        return "Name already exists. Choose another name or group.";
    }

    return null;
}

/**
 * @param {string} attributeName
 * @param {string} groupPath
 * @param {SampleAttributeType} dataType
 * @returns {string}
 */
export function deriveAttributeName(attributeName, groupPath, dataType) {
    /** @type {Record<string, import("@genome-spy/app/spec/sampleView.js").SampleAttributeDef>} */
    const attributeDefs = {
        [attributeName]: {
            type: dataType,
        },
    };

    if (groupPath.length === 0) {
        return Object.keys(attributeDefs)[0];
    }

    const groupedDefs = applyGroupToAttributeDefs(
        attributeDefs,
        groupPath,
        METADATA_PATH_SEPARATOR
    );
    return Object.keys(groupedDefs)[0];
}

/**
 * @param {import("../types.js").AttributeIdentifier} attribute
 * @param {{ name: string, groupPath: string, scale?: import("@genome-spy/core/spec/scale.js").Scale }} config
 * @returns {import("../state/payloadTypes.js").DeriveMetadata}
 */
export function buildDerivedMetadataIntent(attribute, config) {
    return {
        attribute,
        name: config.name,
        groupPath: emptyToUndefined(config.groupPath),
        scale: emptyToUndefined(config.scale),
    };
}

/**
 * Builds a unique derived attribute name within the length limit.
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {string[]} existingNames
 * @returns {string}
 */
export function createDerivedAttributeName(attributeInfo, existingNames) {
    const existing = new Set(existingNames);
    const base =
        attributeInfo.name && attributeInfo.name.length > 0
            ? attributeInfo.name.trim()
            : "Derived";

    const preferredLength = 20;
    /** @type {string[]} */
    const candidates = [];
    const shouldCompress = base.length > preferredLength;
    const compressed = shouldCompress
        ? compressAttributeName(base, preferredLength)
        : "";

    if (shouldCompress && compressed.length > 0 && compressed !== base) {
        candidates.push(compressed);
    }

    candidates.push(base);

    if (!shouldCompress && existing.has(base)) {
        const fallback = compressAttributeName(base, preferredLength);
        if (fallback.length > 0 && fallback !== base) {
            candidates.push(fallback);
        }
    }

    for (const candidate of candidates) {
        const unique = ensureUniqueName(candidate, existing);
        if (unique) {
            return unique;
        }
    }

    throw new Error("Unable to generate a unique metadata attribute name.");
}

/**
 * @param {string} baseName
 * @param {Set<string>} existing
 * @returns {string | null}
 */
function ensureUniqueName(baseName, existing) {
    if (!existing.has(baseName)) {
        return baseName;
    }

    for (let counter = 2; counter < Number.MAX_SAFE_INTEGER; counter += 1) {
        const suffix = "-" + String(counter);
        const candidate = appendSuffix(baseName, suffix);
        if (!existing.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * @param {string} baseName
 * @param {string} suffix
 * @returns {string}
 */
function appendSuffix(baseName, suffix) {
    const maxLength = 32;
    if (baseName.length + suffix.length <= maxLength) {
        return baseName + suffix;
    }

    const trimmedLength = Math.max(1, maxLength - suffix.length);
    return baseName.slice(0, trimmedLength) + suffix;
}
