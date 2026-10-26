import { isLegendBindingParameter } from "../../paramRuntime/paramUtils.js";
import { hasChromeAncestor } from "../viewSelectors.js";

/**
 * @typedef {{name: string, runtime: import("../../paramRuntime/viewParamRuntime.js").default}} LegendBinding
 */

/**
 * Resolve authored bindings independently of where generated legends are placed.
 * @param {import("../view.js").default} root
 * @returns {Map<import("../../scales/scaleResolution.js").default, LegendBinding>}
 */
export function resolveLegendBindings(root) {
    const bindings = new Map();
    for (const view of root.getDescendants()) {
        if (hasChromeAncestor(view)) continue;
        for (const param of view.paramRuntime.paramConfigs.values()) {
            if (!isLegendBindingParameter(param)) continue;
            const resolution = view.getScaleResolution(param.bind.legend);
            if (!resolution) {
                throw new Error(
                    `Legend binding "${param.name}" has no color scale in its scope.`
                );
            }
            if (!["nominal", "ordinal"].includes(resolution.type)) {
                throw new Error(
                    `Legend binding "${param.name}" requires a categorical color scale.`
                );
            }
            if (bindings.has(resolution)) {
                throw new Error(
                    "A color scale can bind only one legend parameter."
                );
            }
            const runtime = view.paramRuntime;
            const ref = runtime.getParamRef(param.name);
            for (const member of resolution.getOrderedMembers()) {
                if (
                    !hasChromeAncestor(member.view) &&
                    member.view.paramRuntime.getParamRef(param.name) !== ref
                ) {
                    throw new Error(
                        `Legend binding "${param.name}" must share one parameter across all scale contributors.`
                    );
                }
            }
            bindings.set(resolution, { name: param.name, runtime });
        }
    }
    return bindings;
}

/**
 * @param {import("../../scales/legendResolution.js").LegendDefinition} definition
 */
export function findLegendBinding(definition) {
    const root = definition.view.getDataAncestors().at(-1);
    const binding = resolveLegendBindings(root).get(definition.scaleResolution);
    if (binding && definition.type !== "symbol") {
        throw new Error(
            `Legend binding "${binding.name}" requires a symbol legend.`
        );
    }
    return binding;
}
