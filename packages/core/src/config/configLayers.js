import { mergeConfigScopes } from "./mergeConfig.js";
import { getConfiguredStyleConfig } from "./styleUtils.js";

/**
 * @typedef {{
 *     kind: "style" | "config",
 *     config: Record<string, any>
 * }} ConfigLayer
 *
 * @typedef {{
 *     appendConfig: (scopes: import("../spec/config.js").GenomeSpyConfig[], config: StyleableConfig | undefined) => void,
 *     appendStyle: (scopes: import("../spec/config.js").GenomeSpyConfig[], style: string | string[] | null | undefined) => void,
 *     merge: () => Record<string, any>
 * }} ConfigLayerStack
 *
 * @typedef {{
 *     style?: string | string[] | null
 * }} StyleableConfig
 */

/**
 * Creates an ordered config layer stack that understands GenomeSpy style
 * expansion. A style reference is not an ordinary property: it expands to a
 * separate layer of defaults before the config object that declared it. Keeping
 * these expanded defaults as tagged layers makes `style: null` meaningful: it
 * can remove previously expanded style defaults while preserving ordinary
 * inherited config properties such as `disable`, colors, or label settings.
 *
 * This is primarily needed by guide-like config hierarchies where defaults are
 * assembled from multiple buckets, for example `legend`, `legendTrack`, and
 * channel-level legend properties. The caller remains responsible for appending
 * buckets in the desired precedence order.
 *
 * @returns {ConfigLayerStack}
 */
export function createConfigLayerStack() {
    /** @type {ConfigLayer[]} */
    const layers = [];

    return {
        appendConfig(scopes, config) {
            appendConfigLayer(layers, scopes, config);
        },

        appendStyle(scopes, style) {
            appendStyleLayer(layers, scopes, style);
        },

        merge() {
            return mergeConfigScopes(layers.map((layer) => layer.config));
        },
    };
}

/**
 * @param {ConfigLayer[]} layers
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {StyleableConfig | undefined} config
 */
function appendConfigLayer(layers, scopes, config) {
    if (!config) {
        return;
    }

    appendStyleLayer(
        layers,
        scopes,
        Object.hasOwn(config, "style") ? config.style : undefined
    );

    layers.push({ kind: "config", config });
}

/**
 * Appends style-expanded defaults without appending the style declaration
 * itself. Use this for explicit style inputs whose only purpose is to select a
 * named style layer.
 *
 * @param {ConfigLayer[]} layers
 * @param {import("../spec/config.js").GenomeSpyConfig[]} scopes
 * @param {string | string[] | null | undefined} style
 */
function appendStyleLayer(layers, scopes, style) {
    if (style === undefined) {
        return;
    }

    if (style === null) {
        removeStyleLayers(layers);
        return;
    }

    const styleConfig = getConfiguredStyleConfig(scopes, style);
    layers.push({ kind: "style", config: styleConfig });
}

/**
 * Removes expanded style layers while leaving ordinary config layers intact.
 * This allows a deeper config scope to clear inherited styles without clearing
 * unrelated inherited defaults.
 *
 * @param {ConfigLayer[]} layers
 */
function removeStyleLayers(layers) {
    for (let index = layers.length - 1; index >= 0; index--) {
        if (layers[index].kind == "style") {
            layers.splice(index, 1);
        }
    }
}
