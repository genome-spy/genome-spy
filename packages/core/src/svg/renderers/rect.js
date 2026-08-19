import { createSvgElement } from "../svgElement.js";
import {
    resolveRectProperties,
    visitRectInstances,
} from "../../rendering/cpu/rect.js";
import { traceRoundedRectPath } from "../../rendering/cpu/roundedRectPath.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    formatSvgNumber,
    toSvgString,
} from "../svgMarkUtils.js";
import { formatSvgUnitless } from "../svgNumber.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderRectSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/rect.js").default} */ (
        baseMark
    );
    const properties = resolveRectProperties(mark);
    const { shadow, hatch } = properties;

    const { group, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
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
    const shadowStyles =
        shadow.opacity > 0
            ? {
                  fill: shadow.color,
                  "fill-opacity": 1,
                  stroke: shadow.color,
                  "stroke-opacity": 1,
                  opacity: formatSvgUnitless(shadow.opacity * viewOpacity),
                  filter: options.getShadowFilterUrl(shadow),
              }
            : null;
    const roundedRectPathBuilder = createRoundedRectPathBuilder();
    return visitRectInstances(mark, properties, options, (instance) => {
        if (options.countOnly) {
            return;
        }
        const {
            datum,
            x,
            y,
            width,
            height,
            radii,
            opacityFactor,
            strokeWidth,
            fill,
            fillOpacity,
        } = instance;
        /** @type {Record<string, string | number>} */
        const styles = {
            ...encodeStyles(datum),
            ...(opacityFactor == 1
                ? {}
                : { opacity: formatSvgUnitless(opacityFactor) }),
        };
        if (hatch != "none" && strokeWidth > 0) {
            styles.fill = options.getRectHatchPatternUrl({
                type: hatch,
                fill: toSvgString(encoders.fill(datum)),
                fillOpacity:
                    encodeNumber(encoders.fillOpacity, datum) * viewOpacity,
                stroke: toSvgString(encoders.stroke(datum)),
                strokeOpacity:
                    encodeNumber(encoders.strokeOpacity, datum) * viewOpacity,
                strokeWidth,
            });
            // Override a constant fill opacity inherited from the mark group;
            // the pattern definition already contains both paint opacities.
            styles["fill-opacity"] = 1;
        }

        if (shadowStyles) {
            const shadowElement = createRectElement(
                x,
                y,
                width,
                height,
                radii,
                {
                    ...shadowStyles,
                    "stroke-width": formatSvgNumber(strokeWidth),
                },
                roundedRectPathBuilder
            );

            // An opaque foreground rect covers the interior half of the blur,
            // so the direct sibling is both sufficient and the most portable
            // representation for vector editors.
            const hasOpaqueFill =
                hatch == "none" &&
                fill != "none" &&
                fillOpacity == 1 &&
                opacityFactor == 1;
            if (hasOpaqueFill) {
                group.appendChild(shadowElement);
            } else {
                // Translucent fills would reveal the blurred source inside the
                // rect. Clip a parent group so the child filter is evaluated
                // before the exterior cutout in standards-compliant renderers.
                const cutoutPadding = strokeWidth / 2;
                const cutoutRadii = /** @type {CornerRadii} */ (
                    Object.fromEntries(
                        Object.entries(radii).map(([corner, radius]) => [
                            corner,
                            radius + cutoutPadding,
                        ])
                    )
                );
                const cutoutPath = roundedRectPathBuilder.build(
                    x - cutoutPadding,
                    y - cutoutPadding,
                    width + cutoutPadding * 2,
                    height + cutoutPadding * 2,
                    cutoutRadii
                );
                const shadowGroup = createSvgElement("g", {
                    "clip-path": options.getShadowClipPathUrl(cutoutPath),
                });
                shadowGroup.appendChild(shadowElement);
                group.appendChild(shadowGroup);
            }
        }
        group.appendChild(
            createRectElement(
                x,
                y,
                width,
                height,
                radii,
                styles,
                roundedRectPathBuilder
            )
        );
    });
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {CornerRadii} radii
 * @param {Record<string, string | number>} styles
 * @param {{build: (x: number, y: number, width: number, height: number, radii: CornerRadii) => string}} roundedRectPathBuilder
 */
function createRectElement(
    x,
    y,
    width,
    height,
    radii,
    styles,
    roundedRectPathBuilder
) {
    if (hasEqualCornerRadii(radii)) {
        const radius = radii.topLeft;
        const roundedX = formatSvgNumber(x);
        const roundedY = formatSvgNumber(y);
        const roundedX2 = formatSvgNumber(x + width);
        const roundedY2 = formatSvgNumber(y + height);
        return createSvgElement("rect", {
            x: roundedX,
            y: roundedY,
            width: formatSvgNumber(roundedX2 - roundedX),
            height: formatSvgNumber(roundedY2 - roundedY),
            ...(radius
                ? {
                      rx: formatSvgNumber(radius),
                      ry: formatSvgNumber(radius),
                  }
                : {}),
            ...styles,
        });
    } else {
        return createSvgElement("path", {
            d: roundedRectPathBuilder.build(x, y, width, height, radii),
            ...styles,
        });
    }
}

/**
 * @typedef {object} CornerRadii
 * @prop {number} topLeft
 * @prop {number} topRight
 * @prop {number} bottomRight
 * @prop {number} bottomLeft
 */

/** @param {CornerRadii} radii */
function hasEqualCornerRadii(radii) {
    return Object.values(radii).every((radius) => radius == radii.topLeft);
}

/**
 * @returns {{build: (x: number, y: number, width: number, height: number, radii: CornerRadii) => string}}
 */
function createRoundedRectPathBuilder() {
    let pathData = "";
    const point = (/** @type {number} */ x, /** @type {number} */ y) =>
        `${formatSvgNumber(x)} ${formatSvgNumber(y)}`;
    const sink = {
        moveTo(/** @type {number} */ x, /** @type {number} */ y) {
            pathData = `M ${point(x, y)}`;
        },
        horizontalTo(/** @type {number} */ x) {
            pathData += ` H ${formatSvgNumber(x)}`;
        },
        verticalTo(/** @type {number} */ _x, /** @type {number} */ y) {
            pathData += ` V ${formatSvgNumber(y)}`;
        },
        corner(
            /** @type {number} */ radius,
            /** @type {number} */ x,
            /** @type {number} */ y,
            /** @type {number} */ sharpX,
            /** @type {number} */ sharpY
        ) {
            pathData += radius
                ? ` A ${formatSvgNumber(radius)} ${formatSvgNumber(radius)} 0 0 1 ${point(x, y)}`
                : ` L ${point(sharpX, sharpY)}`;
        },
        closePath() {
            pathData += " Z";
        },
    };

    return {
        build(x, y, width, height, radii) {
            traceRoundedRectPath(x, y, width, height, radii, sink);
            return pathData;
        },
    };
}
