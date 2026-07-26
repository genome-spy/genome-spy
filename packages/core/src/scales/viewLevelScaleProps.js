import { VISIT_SKIP } from "../view/view.js";
import { visitNonChromeViews } from "../view/viewSelectors.js";

/**
 * @typedef {import("../spec/channel.js").ChannelWithScale} ChannelWithScale
 * @typedef {import("../spec/scale.js").Scale} Scale
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("./scaleResolution.js").default} ScaleResolution
 *
 * @typedef {object} ViewLevelScalePropsMapping
 * @prop {View} view
 * @prop {ChannelWithScale} channel
 * @prop {Scale} props
 * @prop {ScaleResolution | undefined} resolution
 */

/**
 * Maps view-level scale declarations to the unique scale resolution visible
 * from each declaring subtree. Declarations with no matching resolution stay
 * pending.
 *
 * @param {View} root
 * @returns {ViewLevelScalePropsMapping[]}
 */
export function mapViewLevelScaleProps(root) {
    /** @type {ViewLevelScalePropsMapping[]} */
    const mappings = [];

    for (const view of root.getDescendants()) {
        const scales = view.spec.scales;
        if (!scales) {
            continue;
        }

        for (const [channel, props] of Object.entries(scales)) {
            mappings.push(
                mapViewLevelScaleDeclaration(
                    view,
                    /** @type {ChannelWithScale} */ (channel),
                    props
                )
            );
        }
    }

    return mappings;
}

/**
 * Maps view-level scale declarations and attaches non-pending props to their
 * target resolutions.
 *
 * @param {View} root
 * @returns {ViewLevelScalePropsMapping[]}
 */
export function attachViewLevelScaleProps(root) {
    clearViewLevelScaleProps(root);
    const mappings = mapViewLevelScaleProps(root);
    for (const mapping of mappings) {
        if (mapping.resolution) {
            mapping.resolution.attachViewLevelScaleProps(
                mapping.view,
                mapping.props
            );
        }
    }
    return mappings;
}

/**
 * Clears view-level scale props owned by views in the subtree.
 *
 * @param {View} root
 */
export function clearViewLevelScaleProps(root) {
    const views = new Set(root.getDescendants());
    const resolutions = collectAllScaleResolutions(root);

    for (const resolution of resolutions) {
        const attachment = resolution.getViewLevelScaleProps();
        if (attachment && views.has(attachment.view)) {
            resolution.clearViewLevelScaleProps(attachment.view);
        }
    }
}

/**
 * @param {View} view
 * @param {ChannelWithScale} channel
 * @param {Scale} props
 * @returns {ViewLevelScalePropsMapping}
 */
function mapViewLevelScaleDeclaration(view, channel, props) {
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
        props,
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
    visitNonChromeViews(view, (descendant) => {
        if (
            descendant !== view &&
            descendant.getConfiguredOrDefaultResolution(channel, "scale") ===
                "excluded"
        ) {
            return VISIT_SKIP;
        }

        const resolution = descendant.getScaleResolution(channel);
        if (resolution) {
            resolutions.add(resolution);
        }
    });
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
