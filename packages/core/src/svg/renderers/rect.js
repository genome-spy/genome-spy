import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds } from "../svgBounds.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    formatSvgNumber,
    projectXRange,
    projectYRange,
    resolveSvgProperty,
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
    const p = mark.properties;
    const defaultRadius = resolveSvgProperty(mark, p.cornerRadius);
    const cornerRadii = {
        topLeft: resolveSvgProperty(
            mark,
            p.cornerRadiusTopLeft ?? defaultRadius
        ),
        topRight: resolveSvgProperty(
            mark,
            p.cornerRadiusTopRight ?? defaultRadius
        ),
        bottomRight: resolveSvgProperty(
            mark,
            p.cornerRadiusBottomRight ?? defaultRadius
        ),
        bottomLeft: resolveSvgProperty(
            mark,
            p.cornerRadiusBottomLeft ?? defaultRadius
        ),
    };
    const minWidth = resolveSvgProperty(mark, p.minWidth);
    const minHeight = resolveSvgProperty(mark, p.minHeight);
    const minOpacity = resolveSvgProperty(mark, p.minOpacity);
    const shadow = {
        blur: resolveSvgProperty(mark, p.shadowBlur ?? 0),
        color: resolveSvgProperty(mark, p.shadowColor ?? "black"),
        offsetX: resolveSvgProperty(mark, p.shadowOffsetX ?? 0),
        offsetY: resolveSvgProperty(mark, p.shadowOffsetY ?? 0),
        opacity: resolveSvgProperty(mark, p.shadowOpacity ?? 0),
    };
    const hatch = resolveSvgProperty(mark, p.hatch ?? "none");

    const { coords, data, group, viewOpacity, visibleBounds } = options;
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
                  stroke: shadow.color,
                  opacity: formatSvgUnitless(shadow.opacity * viewOpacity),
                  filter: options.getShadowFilterUrl(shadow),
              }
            : null;

    for (const datum of data) {
        const [x1, x2] = projectXRange(coords, encoders, datum);
        const [y1, y2] = projectYRange(coords, encoders, datum);
        let x = Math.min(x1, x2);
        let y = Math.min(y1, y2);
        let width = Math.abs(x2 - x1);
        let height = Math.abs(y2 - y1);
        const widthFactor = getMinSizeFactor(width, minWidth);
        const heightFactor = getMinSizeFactor(height, minHeight);
        const opacityFactor = Math.max(minOpacity, widthFactor * heightFactor);
        if (width < minWidth) {
            x -= (minWidth - width) / 2;
            width = minWidth;
        }
        if (height < minHeight) {
            y -= (minHeight - height) / 2;
            height = minHeight;
        }
        const strokeWidth = encodeNumber(encoders.strokeWidth, datum);
        const strokePadding = strokeWidth / 2;
        const shadowPadding =
            shadow.opacity > 0
                ? shadow.blur +
                  Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY))
                : 0;
        if (
            !intersectsSvgBounds(
                visibleBounds,
                x,
                y,
                x + width,
                y + height,
                strokePadding + shadowPadding
            )
        ) {
            continue;
        }
        const radii = clampCornerRadii(cornerRadii, width, height);
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
            group.appendChild(
                createRectElement(x, y, width, height, radii, {
                    ...shadowStyles,
                    "stroke-width": formatSvgNumber(strokeWidth),
                })
            );
        }
        group.appendChild(
            createRectElement(x, y, width, height, radii, styles)
        );
    }
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

/** @param {number} size @param {number} minSize */
function getMinSizeFactor(size, minSize) {
    return minSize > 0 && size < minSize ? size / minSize : 1;
}

/**
 * @typedef {object} CornerRadii
 * @prop {number} topLeft
 * @prop {number} topRight
 * @prop {number} bottomRight
 * @prop {number} bottomLeft
 */

/**
 * @param {CornerRadii} radii
 * @param {number} width
 * @param {number} height
 * @returns {CornerRadii}
 */
function clampCornerRadii(radii, width, height) {
    const maxRadius = Math.min(width, height) / 2;
    return /** @type {CornerRadii} */ (
        Object.fromEntries(
            Object.entries(radii).map(([corner, radius]) => [
                corner,
                Math.min(radius, maxRadius),
            ])
        )
    );
}

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
