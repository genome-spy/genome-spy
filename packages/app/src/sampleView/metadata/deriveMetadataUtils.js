import { applyGroupToAttributeDefs } from "./metadataUtils.js";
import emptyToUndefined from "../../utils/emptyToUndefined.js";

/**
 * @typedef {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType} SampleAttributeType
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
    /** @type {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} */
    const attributeDefs = {
        [attributeName]: {
            type: dataType,
        },
    };

    if (groupPath.length === 0) {
        return Object.keys(attributeDefs)[0];
    }

    const groupedDefs = applyGroupToAttributeDefs(attributeDefs, groupPath);
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
    const maxLength = 20;
    const existing = new Set(existingNames);
    const base =
        attributeInfo.name && attributeInfo.name.length > 0
            ? attributeInfo.name.trim()
            : "Derived";

    const baseName = clampName(base, maxLength);
    if (!existing.has(baseName)) {
        return baseName;
    }

    for (let counter = 2; counter < Number.MAX_SAFE_INTEGER; counter += 1) {
        const suffix = "-" + String(counter);
        const candidate = clampName(base, maxLength, suffix);
        if (!existing.has(candidate)) {
            return candidate;
        }
    }

    throw new Error("Unable to generate a unique metadata attribute name.");
}

/**
 * Truncates a name to the target length and appends an optional suffix.
 * @param {string} name
 * @param {number} maxLength
 * @param {string} [suffix]
 * @returns {string}
 */
function clampName(name, maxLength, suffix = "") {
    const targetLength = maxLength - suffix.length;
    let trimmed = name;

    if (trimmed.length > targetLength) {
        if (targetLength > 3) {
            trimmed =
                trimmed.slice(0, targetLength - 3).trimEnd() + "..." + suffix;
        } else {
            trimmed = trimmed.slice(0, targetLength) + suffix;
        }
    } else {
        trimmed = trimmed + suffix;
    }

    return trimmed;
}
