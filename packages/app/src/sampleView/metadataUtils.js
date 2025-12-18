import { inferType } from "vega-loader";
import { joinPathParts, splitPath } from "../utils/escapeSeparator.js";

/**
 * @typedef {Object} PathTreeNode
 * @property {string} part
 * @property {string} path
 * @property {Map<string, PathTreeNode>} children
 * @property {PathTreeNode | null} parent
 */

/**
 * A separator used to denote hierarchy levels in metadata attribute names.
 * For example, "demographics/age" uses "/" as a separator.
 *
 * When loading metadata, another separator may be specified; however,
 * the internal representation always uses this constant to join and split paths.
 * Any existing separator in attribute names will be escaped to avoid conflicts.
 */
export const METADATA_PATH_SEPARATOR = "/";

/**
 * Build a tree from path-like keys. Each node receives a `parent` pointer.
 * @param {string[]} items
 * @param {string} [separator]
 * @returns {PathTreeNode}
 */
export function buildPathTree(items, separator) {
    /** @type {(s: string) => string[]} */
    const split = separator
        ? (/** @type {string} */ s) => splitPath(s, separator)
        : (/** @type {string} */ s) => [s];

    /** @type {Map<string, PathTreeNode>} */
    const rootChildren = new Map();

    /** @type {PathTreeNode} */
    const rootNode = {
        part: "",
        path: "",
        children: rootChildren,
        parent: null,
    };

    for (const attribute of items) {
        const parts = split(attribute);
        let currentNode = rootNode;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!currentNode.children.has(part)) {
                const node = {
                    part,
                    path:
                        separator != null
                            ? joinPathParts(parts.slice(0, i + 1), separator)
                            : part,
                    children: new Map(),
                    parent: currentNode,
                };
                currentNode.children.set(part, node);
            }
            currentNode = currentNode.children.get(part);
        }
    }

    return rootNode;
}

/**
 * @param {string[]} groupPath array of unescaped path segments representing the group path
 * @returns {string} the attribute path prefix for the given group path
 */
export function createAttributePathPrefix(groupPath) {
    if (!groupPath.length) {
        return "";
    }
    return (
        joinPathParts(groupPath, METADATA_PATH_SEPARATOR) +
        METADATA_PATH_SEPARATOR
    );
}

/**
 * Place all keys of an object under a group path by prefixing them.
 * Optionally ignore specified keys (they are copied as-is without prefix).
 *
 * @template T
 * @param {Record<string, T>} obj
 * @param {string[]} groupPath array of unescaped path segments
 * @param {string[]} [ignoredKeys=[]]
 * @returns {Record<string, T>}
 */
export function placeKeysUnderGroup(obj, groupPath = [], ignoredKeys = []) {
    if (!groupPath.length) {
        return obj;
    }

    const prefix = createAttributePathPrefix(groupPath);
    const ignoredSet = new Set(ignoredKeys);

    /** @type {Record<string, T>} */
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (ignoredSet.has(key)) {
            result[key] = value;
        } else {
            result[prefix + key] = value;
        }
    }

    return result;
}

/**
 * Takes columnar metadata where attribute names may represent paths in a hierarchy,
 * and places them under a specified group path.
 *
 * @param {import("./state/payloadTypes.js").ColumnarMetadata} columnarMetadata
 * @param {string[]} groupPath array of unescaped path segments representing the group path
 */
export function placeMetadataUnderGroup(columnarMetadata, groupPath = []) {
    return /** @type {import("./state/payloadTypes.js").ColumnarMetadata} */ (
        placeKeysUnderGroup(columnarMetadata, groupPath, ["sample"])
    );
}

/**
 *
 * @param {import("@genome-spy/core/utils/domainArray.js").scalar[]} values
 * @returns {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType}
 */
function inferMetadataFieldType(values) {
    switch (inferType(values)) {
        case "integer":
        case "number":
            return "quantitative";
        default:
            return "nominal";
    }
}

/**
 * Compute a map of attribute definitions for the given sample metadata.
 * This function essentially fills in missing `type` fields based on the
 * attribute values, while respecting existing definitions.
 *
 * Motivation: attribute definitions may be supplied at group (ancestor) level
 * to apply to many leaf attributes; this function merges explicit defs with
 * inferred types while avoiding unnecessary duplication of defs for leaves.
 *
 * @param {import("./state/sampleState.js").SampleMetadata} sampleMetadata
 * @param {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} existingDefs
 * @param {string} [separator] optional separator used to form attribute hierarchies
 * @returns {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>}
 */
export function computeAttributeDefs(
    sampleMetadata,
    existingDefs = {},
    separator
) {
    const attributeDefs = structuredClone(existingDefs ?? {});

    // build a path tree from all attribute names (so hierarchical defs can be applied)
    const tree = buildPathTree(sampleMetadata.attributeNames, separator);

    // Create a lookup map from full path -> PathTreeNode for quick ancestor lookups
    /** @type {Map<string, PathTreeNode>} */
    const pathMap = new Map();
    /**
     * Walk the path tree and populate `pathMap`.
     * @param {PathTreeNode} node
     */
    function visit(node) {
        if (node.path) {
            pathMap.set(node.path, node);
        }
        for (const child of node.children.values()) {
            visit(child);
        }
    }
    visit(tree);

    for (const attributeName of sampleMetadata.attributeNames) {
        let existingDef = attributeDefs[attributeName];

        // Find the nearest ancestor that has a type definition
        /** @type {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType} */
        let ancestorType = null;

        if (separator != null) {
            const node = pathMap.get(attributeName);
            let ancestor = node?.parent;
            while (ancestor) {
                ancestorType = attributeDefs[ancestor.path]?.type;
                if (ancestorType != null) {
                    break;
                }
                ancestor = ancestor.parent;
            }
        }

        // If an ancestor def with a type exists, do nothing (inherit at view creation time).
        if (ancestorType) {
            continue;
        }

        // No ancestor type found; ensure we have a definition for this attribute
        if (!existingDef) {
            existingDef = {};
            attributeDefs[attributeName] = existingDef;
        }

        // Infer and fill in missing type
        if (!existingDef.type) {
            const values = Object.values(sampleMetadata.entities).map(
                (attrs) => attrs[attributeName]
            );
            existingDef.type = inferMetadataFieldType(values);
        }
    }

    return attributeDefs;
}

/**
 * Combines two SampleMetadata objects into one.
 *
 * It works as follows:
 * - attributeNames: concatenate and throw error on duplicates
 * - attributeDefs: merge the two, throw error on duplicate keys
 * - samples: find the union of sample IDs, and for each sample ID,
 *  combine the metadata from both a and b (if present). Each Metadatum
 * should contain all attributes in attributeNames
 *
 * @param {import("./state/sampleState.js").SampleMetadata} a
 * @param {import("./state/sampleState.js").SampleMetadata} b
 * @returns {import("./state/sampleState.js").SampleMetadata}
 */
export function combineSampleMetadata(a, b) {
    // a and b are required and expected to be valid SampleMetadata objects
    const aNames = a.attributeNames;
    const bNames = b.attributeNames;

    // Check for duplicate attribute names
    const dupNames = aNames.filter((n) => bNames.includes(n));
    if (dupNames.length > 0) {
        throw new Error(`Duplicate attribute names: ${dupNames.join(", ")}`);
    }

    const attributeNames = [...aNames, ...bNames];

    // Merge attributeDefs, throwing on duplicate keys
    const aDefs = a.attributeDefs ?? {};
    const bDefs = b.attributeDefs ?? {};
    const attributeDefs = { ...aDefs };
    for (const k of Object.keys(bDefs)) {
        if (k in attributeDefs) {
            throw new Error(`Duplicate attribute definition key: ${k}`);
        }
        attributeDefs[k] = bDefs[k];
    }

    // Union of sample ids
    const aIds = Object.keys(a.entities);
    const bIds = Object.keys(b.entities);
    const idSet = new Set([...aIds, ...bIds]);

    /** @type {import("./state/sampleState.js").SampleMetadata["entities"]} */
    const entities = {};

    for (const id of idSet) {
        const aEnt = a.entities[id] ?? {};
        const bEnt = b.entities[id] ?? {};

        /** @type {import("./state/sampleState.js").Metadatum} */
        const combined = {};

        for (const attr of attributeNames) {
            if (aNames.includes(attr)) {
                combined[attr] = aEnt[attr];
            } else {
                combined[attr] = bEnt[attr];
            }
        }

        entities[id] = combined;
    }

    /** @type {import("./state/sampleState.js").SampleMetadata} */
    const result = {
        entities,
        attributeNames,
        attributeDefs,
    };

    return result;
}
