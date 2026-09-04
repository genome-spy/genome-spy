import { isInChromeSubtree } from "./viewChrome.js";
import { isHConcatSpec, isVConcatSpec } from "./viewSpecGuards.js";

/**
 * @param {import("./view.js").default} view
 * @param {import("../spec/channel.js").PrimaryPositionalChannel[]} channels
 * @returns {boolean}
 */
export function isRulerGapChannel(view, channels) {
    return (
        channels.length === 1 &&
        ((isVConcatSpec(view.spec) && channels[0] === "x") ||
            (isHConcatSpec(view.spec) && channels[0] === "y"))
    );
}

/**
 * Returns the plot-space projection for a scale resolution.
 *
 * Container views include guide overhang in their own coordinates. Scale
 * members, however, retain the coordinates of the plots that actually use
 * the scale. Use those coordinates for both pointer inversion and overlays.
 *
 * @param {import("../scales/scaleResolution.js").default} scaleResolution
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
 * @param {import("./layout/rectangle.js").default} fallback
 * @param {import("./view.js").default} [scopeView]
 * @returns {import("./layout/rectangle.js").default}
 */
export function getScaleProjectionCoords(
    scaleResolution,
    channel,
    fallback,
    scopeView
) {
    const memberCoords = scaleResolution
        .getOrderedMembers()
        .filter(
            ({ view }) =>
                !isInChromeSubtree(view) &&
                view.isVisible() &&
                (!scopeView || view.getLayoutAncestors().includes(scopeView))
        )
        .map(({ view }) => view.coords)
        .filter(
            (coords) =>
                coords !== undefined && coords.width > 0 && coords.height > 0
        );

    if (memberCoords.length === 0) {
        return fallback;
    }

    // TODO: If shared resolutions guarantee identical screen ranges, use the
    // first eligible member instead of computing this bounding union.
    const start = Math.min(
        ...memberCoords.map((coords) => (channel === "x" ? coords.x : coords.y))
    );
    const end = Math.max(
        ...memberCoords.map((coords) =>
            channel === "x" ? coords.x2 : coords.y2
        )
    );

    return channel === "x"
        ? fallback.modify({ x: start, width: end - start })
        : fallback.modify({ y: start, height: end - start });
}

/**
 * Returns the coordinates that a ruler or interval-selection controller uses
 * to map a pointer to a scale value.
 *
 * @param {import("./view.js").default} view
 * @param {import("../spec/channel.js").PrimaryPositionalChannel[]} channels
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
 * @param {import("../scales/scaleResolution.js").default} scaleResolution
 * @returns {import("./layout/rectangle.js").default}
 */
export function getRulerProjectionCoords(
    view,
    channels,
    channel,
    scaleResolution
) {
    return isRulerGapChannel(view, channels)
        ? getScaleProjectionCoords(scaleResolution, channel, view.coords, view)
        : view.coords;
}
