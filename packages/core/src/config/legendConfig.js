import { mergeConfigScopes } from "./mergeConfig.js";
import { getConfiguredStyleConfig } from "./styleUtils.js";

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
    /** @type {{ kind: "style" | "config", config: Record<string, any> }[]} */
    const layers = [];

    appendLegendScopeDefaults(layers, scopes, baseScope, options.track);

    for (const [index, scope] of scopedOverrides.entries()) {
        const scopedScopes = scopes.slice(0, index + 2);
        appendTrackScopeDefaults(layers, scopedScopes, scope, options.track);
        appendLegendConfigLayer(layers, scopedScopes, scope.legend);
    }

    appendLegendConfigLayer(layers, scopes, legend);

    return /** @type {import("../spec/legend.js").LegendConfig} */ (
        mergeConfigScopes(layers.map((layer) => layer.config))
    );
}

/**
 * @param {{ kind: "style" | "config", config: Record<string, any> }[]} layers
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
 * @param {{ kind: "style" | "config", config: Record<string, any> }[]} layers
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
 * @param {{ kind: "style" | "config", config: Record<string, any> }[]} layers
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {import("../spec/legend.js").Legend | import("../spec/legend.js").LegendConfig | undefined} config
 */
function appendLegendConfigLayer(layers, scopes, config) {
    if (!config) {
        return;
    }

    if (Object.hasOwn(config, "style") && config.style === null) {
        removeStyleLayers(layers);
    } else {
        const styleConfig = getConfiguredStyleConfig(scopes, config.style);
        layers.push({ kind: "style", config: styleConfig });
    }

    layers.push({ kind: "config", config });
}

/**
 * @param {{ kind: "style" | "config", config: Record<string, any> }[]} layers
 */
function removeStyleLayers(layers) {
    for (let index = layers.length - 1; index >= 0; index--) {
        if (layers[index].kind == "style") {
            layers.splice(index, 1);
        }
    }
}
