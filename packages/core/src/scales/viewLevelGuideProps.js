import { VISIT_SKIP } from "../view/view.js";
import { visitNonChromeViews } from "../view/viewSelectors.js";

/**
 * @typedef {import("../spec/channel.js").ChannelWithScale} ChannelWithScale
 * @typedef {import("../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis} AxisProps
 * @typedef {import("../spec/legend.js").Legend} LegendProps
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("./axisResolution.js").default} AxisResolution
 * @typedef {import("./legendResolution.js").default} LegendResolution
 *
 * @typedef {object} ViewLevelAxisPropsMapping
 * @prop {View} view
 * @prop {PrimaryPositionalChannel} channel
 * @prop {Partial<AxisProps>} props
 * @prop {AxisResolution | undefined} resolution
 *
 * @typedef {object} ViewLevelLegendPropsMapping
 * @prop {View} view
 * @prop {ChannelWithScale} channel
 * @prop {LegendProps} props
 * @prop {LegendResolution | undefined} resolution
 *
 * @typedef {object} GuidePropsSpec
 * @prop {"axes" | "legends"} declarationKey
 * @prop {"axis" | "legend"} resolutionType
 * @prop {(view: View, channel: any) => AxisResolution | LegendResolution | undefined} getResolution
 * @prop {(view: View) => Iterable<AxisResolution | LegendResolution>} getAllResolutions
 * @prop {(resolution: any, view: View, props: any) => void} attach
 * @prop {(resolution: any) => { view: View } | undefined} getAttachedProps
 * @prop {(resolution: any, view: View) => void} clear
 */

/** @type {GuidePropsSpec} */
const AXIS_GUIDE = {
    declarationKey: "axes",
    resolutionType: "axis",
    getResolution: (view, channel) => view.getAxisResolution(channel),
    getAllResolutions: (view) => Object.values(view.resolutions.axis),
    attach: (resolution, view, props) =>
        resolution.attachViewLevelAxisProps(view, props),
    getAttachedProps: (resolution) => resolution.getViewLevelAxisProps(),
    clear: (resolution, view) => resolution.clearViewLevelAxisProps(view),
};

/** @type {GuidePropsSpec} */
const LEGEND_GUIDE = {
    declarationKey: "legends",
    resolutionType: "legend",
    getResolution: (view, channel) => view.getLegendResolution(channel),
    getAllResolutions: (view) => Object.values(view.resolutions.legend),
    attach: (resolution, view, props) =>
        resolution.attachViewLevelLegendProps(view, props),
    getAttachedProps: (resolution) => resolution.getViewLevelLegendProps(),
    clear: (resolution, view) => resolution.clearViewLevelLegendProps(view),
};

/**
 * Maps view-level axis declarations and attaches non-pending props to their
 * target resolutions.
 *
 * @param {View} root
 * @returns {ViewLevelAxisPropsMapping[]}
 */
export function attachViewLevelAxisProps(root) {
    return /** @type {ViewLevelAxisPropsMapping[]} */ (
        attachViewLevelGuideProps(root, AXIS_GUIDE)
    );
}

/**
 * Maps view-level legend declarations and attaches non-pending props to their
 * target resolutions.
 *
 * @param {View} root
 * @returns {ViewLevelLegendPropsMapping[]}
 */
export function attachViewLevelLegendProps(root) {
    return /** @type {ViewLevelLegendPropsMapping[]} */ (
        attachViewLevelGuideProps(root, LEGEND_GUIDE)
    );
}

/**
 * Clears view-level guide props owned by views in the subtree.
 *
 * @param {View} root
 */
export function clearViewLevelGuideProps(root) {
    clearViewLevelGuidePropsOfType(root, AXIS_GUIDE);
    clearViewLevelGuidePropsOfType(root, LEGEND_GUIDE);
}

/**
 * @param {View} root
 * @param {GuidePropsSpec} guide
 * @returns {Array<ViewLevelAxisPropsMapping | ViewLevelLegendPropsMapping>}
 */
function attachViewLevelGuideProps(root, guide) {
    clearViewLevelGuidePropsOfType(root, guide);
    const mappings = mapViewLevelGuideProps(root, guide);
    for (const mapping of mappings) {
        if (mapping.resolution) {
            guide.attach(mapping.resolution, mapping.view, mapping.props);
        }
    }
    return mappings;
}

/**
 * Maps view-level guide declarations to the unique guide resolution visible
 * from each declaring subtree. Declarations with no matching resolution stay
 * pending.
 *
 * @param {View} root
 * @param {GuidePropsSpec} guide
 * @returns {Array<ViewLevelAxisPropsMapping | ViewLevelLegendPropsMapping>}
 */
function mapViewLevelGuideProps(root, guide) {
    /** @type {Array<ViewLevelAxisPropsMapping | ViewLevelLegendPropsMapping>} */
    const mappings = [];

    for (const view of root.getDescendants()) {
        const declarations = view.spec[guide.declarationKey];
        if (!declarations) {
            continue;
        }

        for (const [channel, props] of Object.entries(declarations)) {
            mappings.push(
                mapViewLevelGuideDeclaration(view, guide, channel, props)
            );
        }
    }

    return mappings;
}

/**
 * @param {View} view
 * @param {GuidePropsSpec} guide
 * @param {string} channel
 * @param {unknown} props
 * @returns {ViewLevelAxisPropsMapping | ViewLevelLegendPropsMapping}
 */
function mapViewLevelGuideDeclaration(view, guide, channel, props) {
    const resolutions = collectVisibleGuideResolutions(view, guide, channel);

    if (resolutions.size > 1) {
        throw new Error(
            `View-level ${guide.declarationKey}.${channel} maps to multiple ${guide.resolutionType} resolutions. ` +
                `Move ${guide.declarationKey}.${channel} closer to the intended subtree or configure ${guide.resolutionType} resolution explicitly.`
        );
    }

    return {
        view,
        channel: /** @type {PrimaryPositionalChannel & ChannelWithScale} */ (
            channel
        ),
        props: /** @type {Partial<AxisProps> & LegendProps} */ (props),
        resolution: resolutions.values().next().value,
    };
}

/**
 * @param {View} view
 * @param {GuidePropsSpec} guide
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
 * @param {GuidePropsSpec} guide
 */
function clearViewLevelGuidePropsOfType(root, guide) {
    const views = new Set(root.getDescendants());
    const resolutions = collectAllGuideResolutions(root, guide);

    for (const resolution of resolutions) {
        const attachment = guide.getAttachedProps(resolution);
        if (attachment && views.has(attachment.view)) {
            guide.clear(resolution, attachment.view);
        }
    }
}

/**
 * @param {View} view
 * @param {GuidePropsSpec} guide
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
