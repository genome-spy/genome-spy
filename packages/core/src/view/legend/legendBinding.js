import { asSelectionConfig } from "../../selection/selection.js";
import { isLegendBound } from "../../selection/projectedSelection.js";

/**
 * Bind one categorical color legend using Vega-Lite's single-field contract.
 * https://github.com/vega/vega-lite/blob/main/src/compile/selection/legends.ts
 *
 * @param {import("../view.js").default} view
 * @param {string | undefined} field
 * @param {import("../../spec/channel.js").ChannelWithScale} channel
 * @param {"symbol" | "gradient"} type
 * @param {import("../../spec/channel.js").Type} dataType
 */
export function findLegendBinding(view, field, channel, type, dataType) {
    const seen = new Set();
    const bindings = [];
    for (const ancestor of view.getDataAncestors()) {
        for (const [name, param] of ancestor.paramRuntime.paramConfigs) {
            if (seen.has(name)) continue;
            seen.add(name);
            if (!isLegendBound(param) || !("select" in param)) continue;
            const select = asSelectionConfig(param.select);
            if (select.type !== "point" || select.fields?.[0] !== field)
                continue;
            if (
                !["color", "fill", "stroke"].includes(channel) ||
                type !== "symbol" ||
                !["nominal", "ordinal"].includes(dataType)
            ) {
                throw new Error(
                    `Legend binding "${name}" requires a categorical color symbol legend.`
                );
            }
            bindings.push({ name, field, select });
        }
    }
    if (bindings.length > 1)
        throw new Error("A legend can bind only one selection.");
    return bindings[0];
}
