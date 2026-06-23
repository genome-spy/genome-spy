import { VISIT_SKIP } from "../view/view.js";
import { visitNonChromeViews } from "../view/viewSelectors.js";

/**
 * @typedef {import("../spec/channel.js").ChannelWithScale} ChannelWithScale
 * @typedef {import("../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis} AxisConfig
 * @typedef {import("../spec/legend.js").Legend} LegendConfig
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("./axisResolution.js").default} AxisResolution
 * @typedef {import("./legendResolution.js").default} LegendResolution
 *
 * @typedef {object} ViewLevelAxisConfigMapping
 * @prop {View} view
 * @prop {PrimaryPositionalChannel} channel
 * @prop {Partial<AxisConfig>} config
 * @prop {AxisResolution | undefined} resolution
 *
 * @typedef {object} ViewLevelLegendConfigMapping
 * @prop {View} view
 * @prop {ChannelWithScale} channel
 * @prop {LegendConfig} config
 * @prop {LegendResolution | undefined} resolution
 *
 * @typedef {object} GuideConfigSpec
 * @prop {"axes" | "legends"} configKey
 * @prop {"axis" | "legend"} resolutionType
 * @prop {(view: View, channel: any) => AxisResolution | LegendResolution | undefined} getResolution
 * @prop {(view: View) => Iterable<AxisResolution | LegendResolution>} getAllResolutions
 * @prop {(resolution: any, view: View, config: any) => void} attach
 * @prop {(resolution: any) => { view: View } | undefined} getAttachedConfig
 * @prop {(resolution: any, view: View) => void} clear
 */

/** @type {GuideConfigSpec} */
const AXIS_GUIDE = {
    configKey: "axes",
    resolutionType: "axis",
    getResolution: (view, channel) => view.getAxisResolution(channel),
    getAllResolutions: (view) => Object.values(view.resolutions.axis),
    attach: (resolution, view, config) =>
        resolution.attachViewLevelAxisConfig(view, config),
    getAttachedConfig: (resolution) => resolution.getViewLevelAxisConfig(),
    clear: (resolution, view) => resolution.clearViewLevelAxisConfig(view),
};

/** @type {GuideConfigSpec} */
const LEGEND_GUIDE = {
    configKey: "legends",
    resolutionType: "legend",
    getResolution: (view, channel) => view.getLegendResolution(channel),
    getAllResolutions: (view) => Object.values(view.resolutions.legend),
    attach: (resolution, view, config) =>
        resolution.attachViewLevelLegendConfig(view, config),
    getAttachedConfig: (resolution) => resolution.getViewLevelLegendConfig(),
    clear: (resolution, view) => resolution.clearViewLevelLegendConfig(view),
};

/**
 * Maps view-level axis configs and attaches non-pending configs to their
 * target resolutions.
 *
 * @param {View} root
 * @returns {ViewLevelAxisConfigMapping[]}
 */
export function attachViewLevelAxisConfigs(root) {
    return /** @type {ViewLevelAxisConfigMapping[]} */ (
        attachViewLevelGuideConfigs(root, AXIS_GUIDE)
    );
}

/**
 * Maps view-level legend configs and attaches non-pending configs to their
 * target resolutions.
 *
 * @param {View} root
 * @returns {ViewLevelLegendConfigMapping[]}
 */
export function attachViewLevelLegendConfigs(root) {
    return /** @type {ViewLevelLegendConfigMapping[]} */ (
        attachViewLevelGuideConfigs(root, LEGEND_GUIDE)
    );
}

/**
 * Clears view-level guide configs owned by views in the subtree.
 *
 * @param {View} root
 */
export function clearViewLevelGuideConfigs(root) {
    clearViewLevelGuideConfigsOfType(root, AXIS_GUIDE);
    clearViewLevelGuideConfigsOfType(root, LEGEND_GUIDE);
}

/**
 * @param {View} root
 * @param {GuideConfigSpec} guide
 * @returns {Array<ViewLevelAxisConfigMapping | ViewLevelLegendConfigMapping>}
 */
function attachViewLevelGuideConfigs(root, guide) {
    clearViewLevelGuideConfigsOfType(root, guide);
    const mappings = mapViewLevelGuideConfigs(root, guide);
    for (const mapping of mappings) {
        if (mapping.resolution) {
            guide.attach(mapping.resolution, mapping.view, mapping.config);
        }
    }
    return mappings;
}

/**
 * Maps view-level guide configs to the unique guide resolution visible from
 * each configured subtree. Configs with no matching resolution stay pending.
 *
 * @param {View} root
 * @param {GuideConfigSpec} guide
 * @returns {Array<ViewLevelAxisConfigMapping | ViewLevelLegendConfigMapping>}
 */
function mapViewLevelGuideConfigs(root, guide) {
    /** @type {Array<ViewLevelAxisConfigMapping | ViewLevelLegendConfigMapping>} */
    const mappings = [];

    for (const view of root.getDescendants()) {
        const configs = view.spec[guide.configKey];
        if (!configs) {
            continue;
        }

        for (const [channel, config] of Object.entries(configs)) {
            mappings.push(
                mapViewLevelGuideConfig(view, guide, channel, config)
            );
        }
    }

    return mappings;
}

/**
 * @param {View} view
 * @param {GuideConfigSpec} guide
 * @param {string} channel
 * @param {unknown} config
 * @returns {ViewLevelAxisConfigMapping | ViewLevelLegendConfigMapping}
 */
function mapViewLevelGuideConfig(view, guide, channel, config) {
    const resolutions = collectVisibleGuideResolutions(view, guide, channel);

    if (resolutions.size > 1) {
        throw new Error(
            `View-level ${guide.configKey}.${channel} maps to multiple ${guide.resolutionType} resolutions. ` +
                `Move ${guide.configKey}.${channel} closer to the intended subtree or configure ${guide.resolutionType} resolution explicitly.`
        );
    }

    return {
        view,
        channel: /** @type {PrimaryPositionalChannel & ChannelWithScale} */ (
            channel
        ),
        config: /** @type {Partial<AxisConfig> & LegendConfig} */ (config),
        resolution: resolutions.values().next().value,
    };
}

/**
 * @param {View} view
 * @param {GuideConfigSpec} guide
 * @param {string} channel
 * @returns {Set<AxisResolution | LegendResolution>}
 */
function collectVisibleGuideResolutions(view, guide, channel) {
    /** @type {Set<AxisResolution | LegendResolution>} */
    const resolutions = new Set();
    visitNonChromeViews(view, (descendant) => {
        if (
            descendant !== view &&
            descendant.getConfiguredOrDefaultResolution(
                /** @type {ChannelWithScale} */ (channel),
                guide.resolutionType
            ) === "excluded"
        ) {
            return VISIT_SKIP;
        }

        const resolution = guide.getResolution(descendant, channel);
        if (resolution) {
            resolutions.add(resolution);
        }
    });
    return resolutions;
}

/**
 * @param {View} root
 * @param {GuideConfigSpec} guide
 */
function clearViewLevelGuideConfigsOfType(root, guide) {
    const views = new Set(root.getDescendants());
    const resolutions = collectAllGuideResolutions(root, guide);

    for (const resolution of resolutions) {
        const config = guide.getAttachedConfig(resolution);
        if (config && views.has(config.view)) {
            guide.clear(resolution, config.view);
        }
    }
}

/**
 * @param {View} view
 * @param {GuideConfigSpec} guide
 * @returns {Set<AxisResolution | LegendResolution>}
 */
function collectAllGuideResolutions(view, guide) {
    /** @type {Set<AxisResolution | LegendResolution>} */
    const resolutions = new Set();
    for (const descendant of view.getDescendants()) {
        for (const resolution of guide.getAllResolutions(descendant)) {
            resolutions.add(resolution);
        }
    }
    return resolutions;
}
