import { inferType } from "vega-loader";

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
 * @returns {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType}
 */
export function inferFieldType(values) {
    switch (inferType(values)) {
        case "integer":
        case "number":
            return "quantitative";
        default:
            return "nominal";
    }
}
