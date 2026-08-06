import { createSvgElement } from "../svgElement.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    encodeString,
    formatSvgNumber,
    projectX,
    projectY,
    toSvgString,
} from "../svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderPointSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/point.js").default} */ (
        baseMark
    );
    if (
        mark.properties.inwardStroke ||
        mark.properties.fillGradientStrength ||
        mark.properties.geometricZoomBound
    ) {
        options.warn(
            "SVG export ignored unsupported point gradients or zoom-dependent geometry."
        );
    }

    const { coords, data, group, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const semanticThreshold = mark.getSemanticThreshold();
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.fill, transform: toSvgString },
        "fill-opacity": {
            encoder: encoders.fillOpacity,
            transform: (value) => +value * viewOpacity,
        },
        stroke: { encoder: encoders.stroke, transform: toSvgString },
        "stroke-opacity": {
            encoder: encoders.strokeOpacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.strokeWidth,
            transform: (value) => formatSvgNumber(+value),
        },
    });

    for (const datum of data) {
        const shape = encodeString(encoders.shape, datum);
        if (shape != "circle") {
            options.warn(
                `SVG export rendered unsupported point shape "${shape}" as a circle.`
            );
        }
        if (encodeNumber(encoders.semanticScore, datum) < semanticThreshold) {
            continue;
        }

        group.appendChild(
            createSvgElement("circle", {
                cx: formatSvgNumber(
                    projectX(
                        coords,
                        encodePosition(encoders.x, datum),
                        encodeNumber(encoders.xOffset, datum) +
                            encodeNumber(encoders.dx, datum)
                    )
                ),
                cy: formatSvgNumber(
                    projectY(
                        coords,
                        encodePosition(encoders.y, datum),
                        encodeNumber(encoders.yOffset, datum) -
                            encodeNumber(encoders.dy, datum)
                    )
                ),
                r: formatSvgNumber(
                    Math.sqrt(encodeNumber(encoders.size, datum)) / 2
                ),
                ...encodeStyles(datum),
            })
        );
    }
}
