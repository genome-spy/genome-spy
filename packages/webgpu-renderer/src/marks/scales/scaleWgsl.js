import SCALE_COMMON_WGSL from "../../wgsl/scaleCommon.wgsl.js";
import { getScaleDefs } from "./scaleDefs.js";

/**
 * Assemble WGSL snippets from scale definitions, honoring dependencies.
 *
 * @returns {string}
 */
export function buildScaleWgsl() {
    const defs = getScaleDefs();
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

    for (const name of Object.keys(defs)) {
        visit(name);
    }

    const scaleBlocks = fragments.length ? `\n${fragments.join("\n")}` : "";
    return `${SCALE_COMMON_WGSL}${scaleBlocks}`;
}
