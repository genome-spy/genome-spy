import { getExternalAxisOverhang } from "../axisView.js";
import { isActiveLegendRegion } from "./gridChildLegends.js";

const LEGEND_ZINDEX = 1;

/**
 * Based on Vega's start/middle/end legend region anchoring:
 * https://github.com/vega/vega/blob/master/packages/vega-view-transforms/src/layout/legend.js
 *
 * @param {import("../../spec/legend.js").LegendRegionAnchor} anchor
 */
function getAnchorFactor(anchor) {
    if (anchor == "start") {
        return 0;
    } else if (anchor == "middle") {
        return 0.5;
    } else if (anchor == "end") {
        return 1;
    } else {
        throw new Error(`Invalid legend region anchor: ${anchor}`);
    }
}

/**
 * @param {import("../layout/rectangle.js").default} coords
 * @param {import("../../spec/legend.js").LegendOrient} orient
 * @param {{
 *     getPerpendicularSize: () => number,
 *     getOffset: () => number,
 *     getAnchor?: () => import("../../spec/legend.js").LegendRegionAnchor,
 *     getParallelSize?: () => number | undefined,
 *     getWidth?: () => number,
 *     getHeight?: () => number
 * }} legendView
 * @param {number} [axisOffset]
 */
export function translateLegendCoords(
    coords,
    orient,
    legendView,
    axisOffset = 0
) {
    const ps = legendView.getPerpendicularSize();
    const offset = legendView.getOffset();
    const horizontalEdge = orient == "top" || orient == "bottom";
    const availableParallelSize = horizontalEdge ? coords.width : coords.height;
    const parallelSize =
        legendView.getParallelSize?.() ?? availableParallelSize;
    const anchor = legendView.getAnchor?.() ?? "start";
    const parallelOffset =
        getAnchorFactor(anchor) * (availableParallelSize - parallelSize);
    const cornerParallelSize =
        legendView.getParallelSize?.() ?? coords.height - 2 * offset;
    const cornerWidth = legendView.getWidth?.() ?? ps;
    const cornerHeight = legendView.getHeight?.() ?? cornerParallelSize;

    if (orient == "bottom") {
        return coords
            .translate(parallelOffset, coords.height + axisOffset + offset)
            .modify({ width: parallelSize, height: ps });
    } else if (orient == "top") {
        return coords
            .translate(parallelOffset, -ps - axisOffset - offset)
            .modify({ width: parallelSize, height: ps });
    } else if (orient == "left") {
        return coords
            .translate(-ps - axisOffset - offset, parallelOffset)
            .modify({ width: ps, height: parallelSize });
    } else if (orient == "right") {
        return coords
            .translate(coords.width + axisOffset + offset, parallelOffset)
            .modify({ width: ps, height: parallelSize });
    } else if (orient == "top-left") {
        return coords
            .translate(axisOffset + offset, offset)
            .modify({ width: cornerWidth, height: cornerHeight });
    } else if (orient == "top-right") {
        return coords
            .translate(coords.width - cornerWidth - axisOffset - offset, offset)
            .modify({ width: cornerWidth, height: cornerHeight });
    } else if (orient == "bottom-left") {
        return coords
            .translate(
                axisOffset + offset,
                coords.height - cornerHeight - offset
            )
            .modify({ width: cornerWidth, height: cornerHeight });
    } else if (orient == "bottom-right") {
        return coords
            .translate(
                coords.width - cornerWidth - axisOffset - offset,
                coords.height - cornerHeight - offset
            )
            .modify({ width: cornerWidth, height: cornerHeight });
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
export function arrangeLocalLegends(
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
            legendView.arrange(context, legendCoords, options)
        );
    }
}
