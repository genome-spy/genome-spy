import SCALE_COMMON_WGSL from "../../wgsl/scaleCommon.wgsl.js";
import { getScaleDefs } from "./scaleDefs.js";

/**
 * Assemble WGSL snippets from scale definitions, honoring dependencies.
 *
 * @param {Iterable<string> | null} [requiredScales]
 *   When omitted or null, all known scales are emitted. Otherwise only the
 *   provided scale names (and their dependencies) are included.
 * @returns {string}
 */
export function buildScaleWgsl(requiredScales = null) {
    const defs = getScaleDefs();
    const requested = requiredScales == null ? null : new Set(requiredScales);
    /** @type {Set<string>} */
    const visiting = new Set();
    /** @type {Set<string>} */
    const visited = new Set();
    /** @type {string[]} */
    const fragments = [];

    /**
     * @param {string} name
     * @returns {void}
     */
    function visit(name) {
        if (visited.has(name)) {
            return;
        }
        if (visiting.has(name)) {
            throw new Error(`Scale WGSL dependency cycle: ${name}`);
        }
        const def = defs[name];
        if (!def) {
            throw new Error(`Unknown scale dependency "${name}".`);
        }
        visiting.add(name);
        for (const dep of def.wgslDeps ?? []) {
            visit(dep);
        }
        if (def.wgsl) {
            fragments.push(def.wgsl);
        }
        visiting.delete(name);
        visited.add(name);
    }

    if (!requested) {
        for (const name of Object.keys(defs)) {
            visit(name);
        }
        return `${SCALE_COMMON_WGSL}\n${fragments.join("\n")}`;
    }

    for (const name of requested) {
        visit(name);
    }

    return `${SCALE_COMMON_WGSL}\n${fragments.join("\n")}`;
}
