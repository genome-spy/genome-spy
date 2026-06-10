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
 * @prop {boolean} pending
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
        pending: !resolution,
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
