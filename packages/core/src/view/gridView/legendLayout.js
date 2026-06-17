import { getExternalAxisOverhang } from "../axisView.js";
import { isActiveLegendRegion } from "./gridChildLegends.js";

const LEGEND_ZINDEX = 1;

/**
 * @param {import("../layout/rectangle.js").default} coords
 * @param {import("../../spec/legend.js").LegendOrient} orient
 * @param {{
 *     getPerpendicularSize: () => number,
 *     getExternalPadding: () => number,
 *     getParallelSize?: () => number
 * }} legendView
 * @param {number} [offset]
 */
export function translateLegendCoords(coords, orient, legendView, offset = 0) {
    const ps = legendView.getPerpendicularSize();
    const padding = legendView.getExternalPadding();
    const parallelSize = legendView.getParallelSize?.() ?? coords.height;
    const cornerParallelSize =
        legendView.getParallelSize?.() ?? coords.height - 2 * padding;

    if (orient == "bottom") {
        return coords
            .translate(0, coords.height + offset + padding)
            .modify({ height: ps });
    } else if (orient == "top") {
        return coords
            .translate(0, -ps - offset - padding)
            .modify({ height: ps });
    } else if (orient == "left") {
        return coords
            .translate(-ps - offset - padding, 0)
            .modify({ width: ps, height: parallelSize });
    } else if (orient == "right") {
        return coords
            .translate(coords.width + offset + padding, 0)
            .modify({ width: ps, height: parallelSize });
    } else if (orient == "top-left") {
        return coords
            .translate(offset + padding, padding)
            .modify({ width: ps, height: cornerParallelSize });
    } else if (orient == "top-right") {
        return coords
            .translate(coords.width - ps - offset - padding, padding)
            .modify({ width: ps, height: cornerParallelSize });
    } else if (orient == "bottom-left") {
        return coords
            .translate(offset + padding, padding)
            .modify({ width: ps, height: cornerParallelSize });
    } else if (orient == "bottom-right") {
        return coords
            .translate(coords.width - ps - offset - padding, padding)
            .modify({ width: ps, height: cornerParallelSize });
    } else {
        throw new Error(`Invalid legend orientation: ${orient}`);
    }
}

/**
 * @param {import("./gridChildLegends.js").GridChildLegends} legends
 * @param {Partial<Record<import("../../spec/axis.js").AxisOrient, import("../axisView.js").default>>} axes
 * @param {import("../layout/rectangle.js").default} viewportCoords
 * @param {import("../renderingContext/viewRenderingContext.js").default} context
 * @param {import("../../types/rendering.js").RenderingOptions} options
 * @param {(zindex: number, order: number, callback: () => void) => void} queueDecoration
 * @param {number} order
 */
export function renderLocalLegends(
    legends,
    axes,
    viewportCoords,
    context,
    options,
    queueDecoration,
    order
) {
    for (const [orient, legendViews] of Object.entries(legends)) {
        if (!isActiveLegendRegion(legendViews)) {
            continue;
        }

        const offset = getExternalAxisOverhang(
            axes[
                /** @type {import("../../spec/axis.js").AxisOrient} */ (orient)
            ]
        );

        const legendView = legendViews.legendView;
        const legendCoords = translateLegendCoords(
            viewportCoords,
            /** @type {import("../../spec/legend.js").LegendOrient} */ (orient),
            legendView,
            offset
        );
        queueDecoration(LEGEND_ZINDEX, order, () =>
            legendView.render(context, legendCoords, options)
        );
    }
}
