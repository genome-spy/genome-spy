import SCALE_COMMON_WGSL from "../../wgsl/scaleCommon.wgsl.js";

/**
 * Assemble WGSL snippets from scale definitions, honoring dependencies.
 *
 * @param {Iterable<import("../../index.d.ts").ScaleDef>} requiredScales
 *   Scale definitions whose WGSL snippets and dependencies are required.
 * @returns {string}
 */
export function buildScaleWgsl(requiredScales) {
    /** @type {Set<import("../../index.d.ts").ScaleDef>} */
    const visiting = new Set();
    /** @type {Set<import("../../index.d.ts").ScaleDef>} */
    const visited = new Set();
    /** @type {string[]} */
    const fragments = [];

    /**
     * @param {import("../../index.d.ts").ScaleDef} definition
     * @returns {void}
     */
    function visit(definition) {
        if (visited.has(definition)) {
            return;
        }
        if (visiting.has(definition)) {
            throw new Error(`Scale WGSL dependency cycle: ${definition.type}`);
        }
        visiting.add(definition);
        for (const dependency of definition.wgslDeps ?? []) {
            visit(dependency);
        }
        if (definition.wgsl) {
            fragments.push(definition.wgsl);
        }
        visiting.delete(definition);
        visited.add(definition);
    }

    for (const definition of requiredScales) {
        visit(definition);
    }

    return `${SCALE_COMMON_WGSL}\n${fragments.join("\n")}`;
}
