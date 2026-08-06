import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds } from "../svgBounds.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    formatSvgNumber,
    projectX,
    projectY,
    resolveSvgProperty,
    toSvgString,
} from "../svgMarkUtils.js";

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
    if (resolveSvgProperty(mark, p.hatch ?? "none") != "none") {
        options.warn("SVG export ignored an unsupported rectangle hatch.");
    }
    if (resolveSvgProperty(mark, p.shadowOpacity ?? 0) > 0) {
        options.warn(
            "SVG export ignored unsupported rectangle shadow properties."
        );
    }

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

    for (const datum of data) {
        const xOffset = encodeNumber(encoders.xOffset, datum);
        const yOffset = encodeNumber(encoders.yOffset, datum);
        const x2Offset = encoders.x2Offset
            ? encodeNumber(encoders.x2Offset, datum)
            : xOffset;
        const y2Offset = encoders.y2Offset
            ? encodeNumber(encoders.y2Offset, datum)
            : yOffset;
        const x1 = projectX(coords, encodePosition(encoders.x, datum), xOffset);
        const x2 = projectX(
            coords,
            encodePosition(encoders.x2, datum),
            x2Offset
        );
        const y1 = projectY(coords, encodePosition(encoders.y, datum), yOffset);
        const y2 = projectY(
            coords,
            encodePosition(encoders.y2, datum),
            y2Offset
        );
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
        const strokePadding = encodeNumber(encoders.strokeWidth, datum) / 2;
        if (
            !intersectsSvgBounds(
                visibleBounds,
                x,
                y,
                x + width,
                y + height,
                strokePadding
            )
        ) {
            continue;
        }
        const radii = clampCornerRadii(cornerRadii, width, height);
        const styles = {
            ...encodeStyles(datum),
            ...(opacityFactor == 1
                ? {}
                : { opacity: formatSvgNumber(opacityFactor) }),
        };

        if (hasEqualCornerRadii(radii)) {
            const radius = radii.topLeft;
            group.appendChild(
                createSvgElement("rect", {
                    x: formatSvgNumber(x),
                    y: formatSvgNumber(y),
                    width: formatSvgNumber(width),
                    height: formatSvgNumber(height),
                    ...(radius
                        ? {
                              rx: formatSvgNumber(radius),
                              ry: formatSvgNumber(radius),
                          }
                        : {}),
                    ...styles,
                })
            );
        } else {
            group.appendChild(
                createSvgElement("path", {
                    d: createRoundedRectPath(x, y, width, height, radii),
                    ...styles,
                })
            );
        }
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
