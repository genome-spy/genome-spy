import { getExternalAxisOverhang } from "../axisView.js";
import { getExternalLegendOverhang } from "../legendView.js";
import { isActiveLegendEntry } from "./gridChildLegends.js";

/**
 * @param {import("../layout/rectangle.js").default} coords
 * @param {import("../../spec/legend.js").LegendOrient} orient
 * @param {import("../legendView.js").default} legendView
 * @param {number} [offset]
 */
export function translateLegendCoords(coords, orient, legendView, offset = 0) {
    const ps = legendView.getPerpendicularSize();
    const padding = legendView.getExternalPadding();

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
            .modify({ width: ps });
    } else if (orient == "right") {
        return coords
            .translate(coords.width + offset + padding, 0)
            .modify({ width: ps });
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
        let offset = getExternalAxisOverhang(
            axes[
                /** @type {import("../../spec/axis.js").AxisOrient} */ (orient)
            ]
        );
        for (const entry of legendViews) {
            if (!isActiveLegendEntry(entry)) {
                continue;
            }

            const legendView = entry.legendView;
            const legendCoords = translateLegendCoords(
                viewportCoords,
                /** @type {import("../../spec/legend.js").LegendOrient} */ (
                    orient
                ),
                legendView,
                offset
            );
            queueDecoration(0, order, () =>
                legendView.render(context, legendCoords, options)
            );
            offset += getExternalLegendOverhang(legendView);
        }
    }
}
