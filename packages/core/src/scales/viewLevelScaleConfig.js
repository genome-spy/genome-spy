/**
 * @typedef {import("../spec/channel.js").ChannelWithScale} ChannelWithScale
 * @typedef {import("../spec/scale.js").Scale} Scale
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("./scaleResolution.js").default} ScaleResolution
 *
 * @typedef {object} ViewLevelScaleConfigMapping
 * @prop {View} view
 * @prop {ChannelWithScale} channel
 * @prop {Scale} config
 * @prop {ScaleResolution | undefined} resolution
 */

/**
 * Maps view-level scale configs to the unique scale resolution visible from
 * each configured subtree. Configs with no matching resolution stay pending.
 *
 * @param {View} root
 * @returns {ViewLevelScaleConfigMapping[]}
 */
export function mapViewLevelScaleConfigs(root) {
    /** @type {ViewLevelScaleConfigMapping[]} */
    const mappings = [];

    for (const view of root.getDescendants()) {
        const scales = view.spec.scales;
        if (!scales) {
            continue;
        }

        for (const [channel, config] of Object.entries(scales)) {
            mappings.push(
                mapViewLevelScaleConfig(
                    view,
                    /** @type {ChannelWithScale} */ (channel),
                    config
                )
            );
        }
    }

    return mappings;
}

/**
 * Maps view-level scale configs and attaches non-pending configs to their
 * target resolutions.
 *
 * @param {View} root
 * @returns {ViewLevelScaleConfigMapping[]}
 */
export function attachViewLevelScaleConfigs(root) {
    clearViewLevelScaleConfigs(root);
    const mappings = mapViewLevelScaleConfigs(root);
    for (const mapping of mappings) {
        if (mapping.resolution) {
            mapping.resolution.attachViewLevelScaleConfig(
                mapping.view,
                mapping.config
            );
        }
    }
    return mappings;
}

/**
 * Clears view-level scale configs owned by views in the subtree.
 *
 * @param {View} root
 */
export function clearViewLevelScaleConfigs(root) {
    const views = new Set(root.getDescendants());
    const resolutions = collectAllScaleResolutions(root);

    for (const resolution of resolutions) {
        const config = resolution.getViewLevelScaleConfig();
        if (config && views.has(config.view)) {
            resolution.clearViewLevelScaleConfig(config.view);
        }
    }
}

/**
 * @param {View} view
 * @param {ChannelWithScale} channel
 * @param {Scale} config
 * @returns {ViewLevelScaleConfigMapping}
 */
function mapViewLevelScaleConfig(view, channel, config) {
    const resolutions = collectVisibleScaleResolutions(view, channel);

    if (resolutions.size > 1) {
        throw new Error(
            `View-level scales.${channel} maps to multiple scale resolutions. ` +
                `Move scales.${channel} closer to the intended subtree or configure scale resolution explicitly.`
        );
    }

    const resolution = resolutions.values().next().value;
    return {
        view,
        channel,
        config,
        resolution,
    };
}

/**
 * @param {View} view
 * @param {ChannelWithScale} channel
 * @returns {Set<ScaleResolution>}
 */
function collectVisibleScaleResolutions(view, channel) {
    /** @type {Set<ScaleResolution>} */
    const resolutions = new Set();
    for (const descendant of view.getDescendants()) {
        const resolution = descendant.getScaleResolution(channel);
        if (resolution) {
            resolutions.add(resolution);
        }
    }
    return resolutions;
}

/**
 * @param {View} view
 * @returns {Set<ScaleResolution>}
 */
function collectAllScaleResolutions(view) {
    /** @type {Set<ScaleResolution>} */
    const resolutions = new Set();
    for (const descendant of view.getDescendants()) {
        for (const resolution of Object.values(descendant.resolutions.scale)) {
            resolutions.add(resolution);
        }
    }
    return resolutions;
}
