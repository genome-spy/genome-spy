import { inferType } from "vega-loader";

/** @type {Record<string, import("@genome-spy/core/spec/channel.js").Type>} */
export const FieldType = {
    NOMINAL: "nominal",
    ORDINAL: "ordinal",
    QUANTITATIVE: "quantitative",
};

/**
 * @typedef {{path: string, part: string, children: Map<string, PathTreeNode>}} PathTreeNode
 */
/**
 * @param {string[]} items
 * @param {string} separator
 * @returns {PathTreeNode}
 */
export function buildPathThree(items, separator) {
    /** @type {(s: string) => string[]} */
    const split = separator ? (s) => s.split(separator) : (s) => [s];

    /** @type {Map<string, PathTreeNode>} */
    const root = new Map();

    for (const attribute of items) {
        const parts = split(attribute);
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current.has(part)) {
                current.set(part, {
                    part,
                    path:
                        separator != null
                            ? parts.slice(0, i + 1).join(separator)
                            : part,
                    children: new Map(),
                });
            }
            current = current.get(part).children;
        }
    }

    return {
        part: "",
        path: "",
        children: root,
    };
}

/**
 *
 * @param {import("@genome-spy/core/utils/domainArray.js").scalar[]} values
 */
export function inferFieldType(values) {
    switch (inferType(values)) {
        case "integer":
        case "number":
            return FieldType.QUANTITATIVE;
        default:
            return FieldType.NOMINAL;
    }
}
