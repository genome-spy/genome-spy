import { createConfigLayerStack } from "./configLayers.js";
import { mergeConfigScopes } from "./mergeConfig.js";

/**
 * Resolves complete-legend region layout from the destination collector.
 * Based on Vega's orientation-specific legend layout precedence:
 * https://github.com/vega/vega/blob/master/packages/vega-view-transforms/src/layout/legend.js
 *
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").LegendOrient} orient
 * @returns {Required<import("../spec/legend.js").LegendRegionLayout>}
 */
export function getConfiguredLegendRegionLayout(scopes, orient) {
    const layout = /** @type {import("../spec/legend.js").LegendLayout} */ (
        mergeConfigScopes(scopes.map((scope) => scope.legend?.layout))
    );
    const orientLayout = layout[orient];

    const external = ["left", "right", "top", "bottom"].includes(orient);

    return {
        anchor: orientLayout?.anchor ?? layout.anchor ?? "start",
        direction:
            orientLayout?.direction ??
            layout.direction ??
            (orient == "left" || orient == "right" ? "vertical" : "horizontal"),
        wrap: orientLayout?.wrap ?? layout.wrap ?? external,
    };
}

/**
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").Legend | import("../spec/legend.js").LegendConfig} [legend]
 * @param {object} [options]
 * @param {boolean} [options.track]
 * @returns {import("../spec/legend.js").LegendConfig}
 */
export function getConfiguredLegendDefaults(scopes, legend, options = {}) {
    const baseScope = scopes[0];
    const scopedOverrides = scopes.slice(1);
    const layers = createConfigLayerStack();

    appendLegendScopeDefaults(layers, scopes, baseScope, options.track);

    for (const [index, scope] of scopedOverrides.entries()) {
        const scopedScopes = scopes.slice(0, index + 2);
        appendTrackScopeDefaults(layers, scopedScopes, scope, options.track);
        appendLegendConfigLayer(layers, scopedScopes, scope.legend);
    }

    appendLegendConfigLayer(layers, scopes, legend);

    const legendDefaults = layers.merge();
    delete legendDefaults.layout;

    return /** @type {import("../spec/legend.js").LegendConfig} */ (
        legendDefaults
    );
}

/**
 * @param {import("./configLayers.js").ConfigLayerStack} layers
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/config.js").GenomeSpyConfig | undefined} baseScope
 * @param {boolean | undefined} track
 */
function appendLegendScopeDefaults(layers, scopes, baseScope, track) {
    const scopedScopes = scopes.slice(0, 1);
    appendLegendConfigLayer(layers, scopedScopes, baseScope?.legend);
    appendTrackScopeDefaults(layers, scopedScopes, baseScope, track);
}

/**
 * @param {import("./configLayers.js").ConfigLayerStack} layers
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopedScopes
 * @param {import("../spec/config.js").GenomeSpyConfig | undefined} scope
 * @param {boolean | undefined} track
 */
function appendTrackScopeDefaults(layers, scopedScopes, scope, track) {
    if (!track) {
        return;
    }

    appendLegendConfigLayer(layers, scopedScopes, scope?.legendTrack);
}

/**
 * @param {import("./configLayers.js").ConfigLayerStack} layers
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").Legend | import("../spec/legend.js").LegendConfig | undefined} config
 */
function appendLegendConfigLayer(layers, scopes, config) {
    layers.appendConfig(scopes, config);
}
