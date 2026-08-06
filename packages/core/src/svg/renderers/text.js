import { format } from "d3-format";
import { isString } from "vega-util";
import { SDF_PADDING } from "../../fonts/bmFontMetrics.js";
import { createSvgElement } from "../svgElement.js";
import { intersectsSvgBounds, isOutsideSvgBounds } from "../svgBounds.js";
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
export function renderTextSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/text.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    const logoLetters = resolveSvgProperty(mark, props.logoLetters);

    const paddingX = resolveSvgProperty(mark, props.paddingX);
    const paddingY = resolveSvgProperty(mark, props.paddingY);
    const flushX = resolveSvgProperty(mark, props.flushX);
    const flushY = resolveSvgProperty(mark, props.flushY);
    const squeeze = resolveSvgProperty(mark, props.squeeze);
    const dx = resolveSvgProperty(mark, props.dx);
    const dy = resolveSvgProperty(mark, props.dy);

    const {
        coords,
        data,
        group,
        viewOpacity,
        visibleBounds,
        anchorCullBounds,
    } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const channelDef = mark.encoding.text;
    const numberFormat =
        "format" in channelDef
            ? format(channelDef.format)
            : (/** @type {any} */ d) => d;
    const encodeStyles = createSvgAttributeEncoder(group, {
        fill: { encoder: encoders.color, transform: toSvgString },
        "fill-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "font-size": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("font-family", "sans-serif");
    group.setAttribute("font-style", props.fontStyle ?? "normal");
    group.setAttribute(
        "font-weight",
        "" + normalizeFontWeight(props.fontWeight ?? "normal")
    );
    group.setAttribute("text-anchor", textAnchors[props.align]);
    // Do not use SVG dominant-baseline here. Safari and several vector editors
    // ignore it (especially when inherited from a group), so each text element
    // receives an explicit font-size-based dy below.
    const edgeFade = {
        top: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthTop),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceTop
            ),
        },
        right: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthRight),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceRight
            ),
        },
        bottom: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthBottom),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceBottom
            ),
        },
        left: {
            width: resolveSvgProperty(mark, props.viewportEdgeFadeWidthLeft),
            distance: resolveSvgProperty(
                mark,
                props.viewportEdgeFadeDistanceLeft
            ),
        },
    };

    for (const datum of data) {
        const value = numberFormat(encoders.text(datum));
        const stringValue = isString(value)
            ? value
            : value === null
              ? ""
              : "" + value;
        if (!stringValue) {
            continue;
        }

        let [x, x2] = projectXRange(coords, encoders, datum);
        let [y, y2] = projectYRange(coords, encoders, datum);
        const size = encodeNumber(encoders.size, datum);
        const angle = encodeNumber(encoders.angle, datum);
        const hasX2 = !!encoders.x2;
        const hasY2 = !!encoders.y2;

        if (logoLetters) {
            if (stringValue.length > 1) {
                options.warn(
                    "SVG export stretches multi-character logo text as a single glyph cell."
                );
            }

            let width = size;
            let height = size;
            if (hasX2) {
                width = x2 - x;
                x = (x + x2) / 2;
            }
            if (hasY2) {
                // SVG's y axis points down, unlike the unit coordinates used
                // by the shader, so the normal y..y2 range has this sign.
                height = y - y2;
                y = (y + y2) / 2;
            }

            // SVG font-size describes the em box, whose visible glyph is
            // substantially shorter. WebGL expands the SDF glyph quad beyond
            // its bitmap by SDF_PADDING on both sides. Reproduce that expanded
            // height using the same per-glyph metrics while keeping the SVG
            // text plain. Scaling the ink itself to the full range would make
            // adjacent stacked letters overlap.
            //
            // This is only an approximation because the exported sans-serif
            // glyph does not have the same metrics as the SDF BMFont glyph;
            // some overlap or padding may remain. Revisit this when the SDF
            // BMFont text implementation is replaced with a less approximate
            // font-rendering and measurement path.
            const glyph = mark.font.metrics.getChar(stringValue[0]);
            const glyphHeightScale =
                (height *
                    mark.font.metrics.common.base *
                    (glyph.height + 2 * SDF_PADDING)) /
                (glyph.height * glyph.height);

            if (
                !width ||
                !height ||
                isOutsideSvgBounds(anchorCullBounds, x, y) ||
                !textIntersectsVisibleBounds(
                    visibleBounds,
                    x,
                    y,
                    Math.abs(width),
                    Math.abs(height),
                    "center",
                    "middle",
                    angle,
                    dx,
                    dy
                )
            ) {
                continue;
            }

            const transforms = [
                `translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})`,
            ];
            if (angle) {
                transforms.push(`rotate(${formatSvgNumber(angle)})`);
            }
            if (dx || dy) {
                transforms.push(
                    `translate(${formatSvgNumber(dx)} ${formatSvgNumber(dy)})`
                );
            }
            transforms.push(
                `scale(${formatSvgNumber(width)} ${formatSvgNumber(glyphHeightScale)})`
            );

            const text = createSvgElement("text", {
                x: 0,
                y: 0,
                dy: getBaselineOffset("middle", 1),
                "text-anchor": "middle",
                lengthAdjust: "spacingAndGlyphs",
                textLength: 1,
                transform: transforms.join(" "),
                ...encodeStyles(datum),
                // The normalized unit-square geometry must override an
                // encoded font size emitted by encodeStyles.
                "font-size": 1,
            });
            text.textContent = stringValue;
            group.appendChild(text);
            continue;
        }

        const measuredWidth = mark.font.metrics.measureWidth(stringValue, size);
        const rotatedSize = getRotatedSize(measuredWidth, size, angle);
        const rangeAlign =
            hasX2 || hasY2
                ? fixRangeAlign(props.align, props.baseline, angle)
                : {
                      x: alignmentValues[props.align],
                      y: baselineValues[props.baseline],
                  };
        let scale = 1;

        if (hasX2) {
            const result = positionInsideRange(
                Math.min(x, x2),
                Math.max(x, x2),
                rotatedSize.width,
                paddingX,
                rangeAlign.x,
                flushX,
                coords.x,
                coords.x2
            );
            x = result.position;
            scale *= result.scale;
        }

        if (hasY2) {
            const result = positionInsideRange(
                Math.min(y, y2),
                Math.max(y, y2),
                rotatedSize.height * scale,
                paddingY,
                rangeAlign.y,
                flushY,
                coords.y,
                coords.y2
            );
            y = result.position;
            scale *= result.scale;
        }

        if (isOutsideSvgBounds(anchorCullBounds, x, y)) {
            continue;
        }

        let fadeOpacity = 1;
        if (scale < 1) {
            if (!squeeze || scale < 3 / size) {
                continue;
            }
            fadeOpacity = linearstep(3 / size, 6 / size, scale);
        }

        const scaledSize = size * scale;
        const scaledWidth = measuredWidth * scale;
        if (
            !textIntersectsVisibleBounds(
                visibleBounds,
                x,
                y,
                scaledWidth,
                scaledSize,
                props.align,
                props.baseline,
                angle,
                dx,
                dy
            )
        ) {
            continue;
        }
        const svgX = formatSvgNumber(x);
        const svgY = formatSvgNumber(y);
        const text = createSvgElement("text", {
            x: svgX,
            y: svgY,
            dx: formatSvgNumber(dx),
            dy: formatSvgNumber(
                dy + getBaselineOffset(props.baseline, scaledSize)
            ),
            lengthAdjust: "spacingAndGlyphs",
            textLength: formatSvgNumber(scaledWidth),
            ...encodeStyles(datum),
            ...(scale == 1 ? {} : { "font-size": formatSvgNumber(scaledSize) }),
            ...(fadeOpacity == 1
                ? {}
                : { opacity: formatSvgUnitless(fadeOpacity) }),
        });
        text.textContent = stringValue;
        if (angle) {
            text.setAttribute(
                "transform",
                `rotate(${formatSvgNumber(angle)} ${svgX} ${svgY})`
            );
        }
        group.appendChild(text);
    }

    if (group.childElementCount > 0) {
        const edgeFadeMaskUrl = options.getViewportEdgeFadeMaskUrl(edgeFade);
        if (edgeFadeMaskUrl) {
            group.setAttribute("mask", edgeFadeMaskUrl);
        }
    }
}

/**
 * @param {import("../svgBounds.js").SvgBounds} visibleBounds
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {keyof typeof alignmentValues} align
 * @param {keyof typeof baselineValues} baseline
 * @param {number} angleInDegrees
 * @param {number} dx
 * @param {number} dy
 */
function textIntersectsVisibleBounds(
    visibleBounds,
    x,
    y,
    width,
    height,
    align,
    baseline,
    angleInDegrees,
    dx,
    dy
) {
    const x1 = x + dx - ((alignmentValues[align] + 1) / 2) * width;
    const y1 = y + dy - ((baselineValues[baseline] + 1) / 2) * height;
    const x2 = x1 + width;
    const y2 = y1 + height;
    if (!angleInDegrees) {
        return intersectsSvgBounds(visibleBounds, x1, y1, x2, y2, 1);
    }

    const angle = (angleInDegrees * Math.PI) / 180;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const ax = x + (x1 - x) * cos - (y1 - y) * sin;
    const ay = y + (x1 - x) * sin + (y1 - y) * cos;
    const bx = x + (x2 - x) * cos - (y1 - y) * sin;
    const by = y + (x2 - x) * sin + (y1 - y) * cos;
    const cx = x + (x2 - x) * cos - (y2 - y) * sin;
    const cy = y + (x2 - x) * sin + (y2 - y) * cos;
    const dx2 = x + (x1 - x) * cos - (y2 - y) * sin;
    const dy2 = y + (x1 - x) * sin + (y2 - y) * cos;
    return intersectsSvgBounds(
        visibleBounds,
        Math.min(ax, bx, cx, dx2),
        Math.min(ay, by, cy, dy2),
        Math.max(ax, bx, cx, dx2),
        Math.max(ay, by, cy, dy2),
        1
    );
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} angleInDegrees
 */
function getRotatedSize(width, height, angleInDegrees) {
    const angle = (angleInDegrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(angle));
    const cos = Math.abs(Math.cos(angle));
    return {
        width: width * cos + height * sin,
        height: width * sin + height * cos,
    };
}

/**
 * @param {number} start
 * @param {number} end
 * @param {number} contentSpan
 * @param {number} padding
 * @param {number} align
 * @param {boolean} flush
 * @param {number} viewportStart
 * @param {number} viewportEnd
 */
function positionInsideRange(
    start,
    end,
    contentSpan,
    padding,
    align,
    flush,
    viewportStart,
    viewportEnd
) {
    const span = end - start;
    const paddedSpan = contentSpan + 2 * padding;
    if (start > viewportEnd || end < viewportStart) {
        return { position: 0, scale: 0 };
    }

    const extra = Math.max(0, span - paddedSpan);
    let position;
    if (align == 0) {
        let center = start + end;
        if (flush) {
            const startOver = Math.max(
                0,
                2 * viewportStart + paddedSpan - center
            );
            center += Math.min(startOver, extra);

            const endOver = Math.max(0, paddedSpan + center - 2 * viewportEnd);
            center -= Math.min(endOver, extra);
        }
        position = center / 2;
    } else if (align < 0) {
        let edge = start;
        if (flush) {
            edge += Math.min(Math.max(0, viewportStart - edge), extra);
        }
        position = edge + padding;
    } else {
        let edge = end;
        if (flush) {
            edge -= Math.min(Math.max(0, edge - viewportEnd), extra);
        }
        position = edge - padding;
    }

    return {
        position,
        scale: Math.max(0, Math.min(1, (span - padding) / paddedSpan)),
    };
}

/**
 * @param {keyof typeof alignmentValues} align
 * @param {keyof typeof baselineValues} baseline
 * @param {number} angle
 */
function fixRangeAlign(align, baseline, angle) {
    const x = alignmentValues[align];
    const y = -baselineValues[baseline];
    const quadrantAngle = (((angle + 45) % 360) + 360) % 360;
    let rangeX;
    let rangeY;
    if (quadrantAngle < 90) {
        rangeX = x;
        rangeY = y;
    } else if (quadrantAngle < 180) {
        rangeX = y;
        rangeY = -x;
    } else if (quadrantAngle < 270) {
        rangeX = -x;
        rangeY = y;
    } else {
        rangeX = -y;
        rangeY = x;
    }
    return { x: rangeX, y: -rangeY };
}

/** @param {number} edge0 @param {number} edge1 @param {number} value */
function linearstep(edge0, edge1, value) {
    return Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
}

const alignmentValues = {
    left: -1,
    center: 0,
    right: 1,
};

const baselineValues = {
    top: -1,
    middle: 0,
    bottom: 1,
    alphabetic: 1,
    baseline: 1,
};

const textAnchors = {
    left: "start",
    center: "middle",
    right: "end",
};

/**
 * Approximates Canvas text baselines using only the exported font size. Numeric
 * offsets are more interoperable than SVG `dominant-baseline`, particularly in
 * Safari and vector editors. Based on Vega's SVG text offset strategy:
 * https://github.com/vega/vega/blob/main/packages/vega-scenegraph/src/util/text.js
 *
 * @param {keyof typeof baselineValues} baseline
 * @param {number} fontSize
 */
function getBaselineOffset(baseline, fontSize) {
    switch (baseline) {
        case "top":
            return 0.79 * fontSize;
        case "middle":
            return 0.3 * fontSize;
        case "bottom":
            return -0.21 * fontSize;
        case "alphabetic":
        case "baseline":
            return 0;
        default:
            throw new Error(`Unknown text baseline: ${baseline}`);
    }
}

const fontWeights = {
    thin: 100,
    light: 300,
    regular: 400,
    normal: 400,
    medium: 500,
    bold: 700,
    black: 900,
};

/** @param {string | number} weight */
function normalizeFontWeight(weight) {
    return typeof weight == "number"
        ? weight
        : fontWeights[/** @type {keyof typeof fontWeights} */ (weight)];
}
