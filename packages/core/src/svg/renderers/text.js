import { format } from "d3-format";
import { isString } from "vega-util";
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
export function renderTextSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/text.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    if (resolveSvgProperty(mark, props.logoLetters)) {
        options.warn(
            "SVG export ignored unsupported sequence-logo text stretching."
        );
    }

    const paddingX = resolveSvgProperty(mark, props.paddingX);
    const paddingY = resolveSvgProperty(mark, props.paddingY);
    const flushX = resolveSvgProperty(mark, props.flushX);
    const flushY = resolveSvgProperty(mark, props.flushY);
    const squeeze = resolveSvgProperty(mark, props.squeeze);
    const dx = resolveSvgProperty(mark, props.dx);
    const dy = resolveSvgProperty(mark, props.dy);

    const { coords, data, group, viewOpacity, visibleBounds } = options;
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
    group.setAttribute("dominant-baseline", dominantBaselines[props.baseline]);
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

        const xOffset = encodeNumber(encoders.xOffset, datum);
        const yOffset = encodeNumber(encoders.yOffset, datum);
        let x = projectX(coords, encodePosition(encoders.x, datum), xOffset);
        let y = projectY(coords, encodePosition(encoders.y, datum), yOffset);
        const size = encodeNumber(encoders.size, datum);
        const angle = encodeNumber(encoders.angle, datum);
        const measuredWidth = mark.font.metrics.measureWidth(stringValue, size);
        const rotatedSize = getRotatedSize(measuredWidth, size, angle);
        const hasX2 = !!encoders.x2;
        const hasY2 = !!encoders.y2;
        const rangeAlign =
            hasX2 || hasY2
                ? fixRangeAlign(props.align, props.baseline, angle)
                : {
                      x: alignmentValues[props.align],
                      y: baselineValues[props.baseline],
                  };
        let scale = 1;

        if (hasX2) {
            const x2 = projectX(
                coords,
                encodePosition(encoders.x2, datum),
                encoders.x2Offset
                    ? encodeNumber(encoders.x2Offset, datum)
                    : xOffset
            );
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
            const y2 = projectY(
                coords,
                encodePosition(encoders.y2, datum),
                encoders.y2Offset
                    ? encodeNumber(encoders.y2Offset, datum)
                    : yOffset
            );
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
            dy: formatSvgNumber(dy),
            lengthAdjust: "spacingAndGlyphs",
            textLength: formatSvgNumber(scaledWidth),
            ...encodeStyles(datum),
            ...(scale == 1 ? {} : { "font-size": formatSvgNumber(scaledSize) }),
            ...(fadeOpacity == 1
                ? {}
                : { opacity: formatSvgNumber(fadeOpacity) }),
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

const dominantBaselines = {
    top: "text-before-edge",
    middle: "central",
    bottom: "text-after-edge",
    alphabetic: "alphabetic",
    baseline: "alphabetic",
};

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
