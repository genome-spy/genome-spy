import { createSvgElement } from "../svgElement.js";
import {
    resolveRectProperties,
    createRectBoundary,
    setRectBoundary,
    visitRectInstances,
} from "../../immediate/marks/rect.js";
import {
    encodeNumber,
    getPaintOpacityAccessor,
    toPaintString,
} from "../../immediate/markEncoding.js";
import { createSvgAttributeEncoder } from "../svgAttributes.js";
import { formatSvgNumber, formatSvgUnitless } from "../svgNumber.js";

/**
 * @param {import("../../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderRectSvg(baseMark, options) {
    const mark = /** @type {import("../../../marks/rect.js").default} */ (
        baseMark
    );
    const properties = resolveRectProperties(mark);
    const outer = createRectBoundary();
    const inner = createRectBoundary();
    const { shadow, hatch } = properties;

    const { group, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const fillAlpha = getPaintOpacityAccessor(encoders.fill);
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.fill, transform: toPaintString },
        "fill-opacity": {
            encoder: encoders.fillOpacity,
            transform: (value) => +value,
        },
        stroke: { encoder: encoders.stroke, transform: toPaintString },
        "stroke-opacity": {
            encoder: encoders.strokeOpacity,
            transform: (value) => +value,
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
    return visitRectInstances(mark, properties, options, (instance) => {
        if (options.countOnly) {
            return;
        }
        if (
            properties.strokeAlign === "center" &&
            (instance.width === 0 || instance.height === 0)
        ) {
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
        setRectBoundary(outer, instance, instance.strokeOutset);
        /** @type {Record<string, string | number>} */
        // Fade the completed foreground, including the pattern and border.
        const styles = {
            ...encodeStyles(datum),
            ...(opacityFactor * viewOpacity == 1
                ? {}
                : { opacity: formatSvgUnitless(opacityFactor * viewOpacity) }),
        };
        if (hatch != "none" && strokeWidth > 0) {
            styles.fill = options.getRectHatchPatternUrl({
                type: hatch,
                fill: toPaintString(encoders.fill(datum)),
                fillOpacity: encodeNumber(encoders.fillOpacity, datum),
                stroke: toPaintString(encoders.stroke(datum)),
                strokeOpacity: encodeNumber(encoders.strokeOpacity, datum),
                strokeWidth,
            });
            // Override a constant fill opacity inherited from the mark group;
            // the pattern definition already contains both paint opacities.
            styles["fill-opacity"] = 1;
        }

        if (shadowStyles) {
            const shadowElement = createRectElement(
                outer.x,
                outer.y,
                outer.width,
                outer.height,
                outer.radii,
                {
                    ...shadowStyles,
                    stroke: "none",
                }
            );

            // An opaque foreground rect covers the interior half of the blur,
            // so the direct sibling is both sufficient and the most portable
            // representation for vector editors.
            const hasOpaqueFill =
                hatch == "none" &&
                fill != "none" &&
                fillOpacity * fillAlpha(fill) == 1 &&
                opacityFactor == 1;
            if (hasOpaqueFill && instance.strokeOutset === 0) {
                group.appendChild(shadowElement);
            } else {
                // Translucent fills would reveal the blurred source inside the
                // rect. Clip a parent group so the child filter is evaluated
                // before the exterior cutout in standards-compliant renderers.
                const cutoutPath = createRoundedRectPath(
                    outer.x,
                    outer.y,
                    outer.width,
                    outer.height,
                    outer.radii
                );
                const shadowGroup = createSvgElement("g", {
                    "clip-path": options.getShadowClipPathUrl(cutoutPath),
                });
                shadowGroup.appendChild(shadowElement);
                group.appendChild(shadowGroup);
            }
        }
        const stroke = toPaintString(encoders.stroke(datum));
        const strokeOpacity = encodeNumber(encoders.strokeOpacity, datum);
        if (strokeWidth <= 0 || stroke === "none" || strokeOpacity <= 0) {
            group.appendChild(
                createRectElement(x, y, width, height, radii, styles)
            );
        } else {
            const foreground = createSvgElement("g", {
                ...(styles.opacity === undefined
                    ? {}
                    : { opacity: styles.opacity }),
            });
            delete styles.opacity;
            foreground.appendChild(
                createRectElement(x, y, width, height, radii, {
                    ...styles,
                    stroke: "none",
                })
            );
            setRectBoundary(
                inner,
                instance,
                instance.strokeOutset - strokeWidth
            );
            let band = createRoundedRectPath(
                outer.x,
                outer.y,
                outer.width,
                outer.height,
                outer.radii
            );
            if (inner.width > 0 && inner.height > 0) {
                band +=
                    " " +
                    createRoundedRectPath(
                        inner.x,
                        inner.y,
                        inner.width,
                        inner.height,
                        inner.radii
                    );
            }
            foreground.appendChild(
                createSvgElement("path", {
                    d: band,
                    fill: stroke,
                    "fill-opacity": formatSvgUnitless(strokeOpacity),
                    "fill-rule": "evenodd",
                    stroke: "none",
                })
            );
            group.appendChild(foreground);
        }
    });
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {CornerRadii} radii
 * @param {Record<string, string | number>} styles
 */
function createRectElement(x, y, width, height, radii, styles) {
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
            d: createRoundedRectPath(x, y, width, height, radii),
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
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {CornerRadii} radii
 */
function createRoundedRectPath(x, y, width, height, radii) {
    const x2 = x + width;
    const y2 = y + height;
    const { topLeft, topRight, bottomRight, bottomLeft } = radii;
    const commands = [
        `M ${point(x + topLeft, y)}`,
        `H ${formatSvgNumber(x2 - topRight)}`,
        corner(topRight, x2, y + topRight, x2, y),
        `V ${formatSvgNumber(y2 - bottomRight)}`,
        corner(bottomRight, x2 - bottomRight, y2, x2, y2),
        `H ${formatSvgNumber(x + bottomLeft)}`,
        corner(bottomLeft, x, y2 - bottomLeft, x, y2),
        `V ${formatSvgNumber(y + topLeft)}`,
        corner(topLeft, x + topLeft, y, x, y),
        "Z",
    ];
    return commands.join(" ");
}

/**
 * @param {number} radius
 * @param {number} x
 * @param {number} y
 * @param {number} sharpX
 * @param {number} sharpY
 */
function corner(radius, x, y, sharpX, sharpY) {
    return radius
        ? `A ${formatSvgNumber(radius)} ${formatSvgNumber(radius)} 0 0 1 ${point(x, y)}`
        : `L ${point(sharpX, sharpY)}`;
}

/** @param {number} x @param {number} y */
function point(x, y) {
    return `${formatSvgNumber(x)} ${formatSvgNumber(y)}`;
}
