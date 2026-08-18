import { format } from "d3-format";
import { isString } from "vega-util";
import { SDF_PADDING } from "../../fonts/bmFontMetrics.js";
import {
    intersectsSvgBounds,
    isOutsideSvgBounds,
} from "../../svg/svgBounds.js";
import linearstep from "../../utils/linearstep.js";
import {
    encodeNumber,
    projectXRange,
    projectYRange,
    resolveSvgProperty,
} from "../../svg/svgMarkUtils.js";

/**
 * @typedef {object} TextAnchor
 * @prop {object} datum
 * @prop {string} text
 * @prop {number} x
 * @prop {number} x2
 * @prop {number} y
 * @prop {number} y2
 * @prop {number} size
 * @prop {number} angle
 * @prop {boolean} hasX2
 * @prop {boolean} hasY2
 */

/** @param {import("../../marks/text.js").default} mark */
export function resolveTextProperties(mark) {
    const props = mark.properties;
    return {
        logoLetters: resolveSvgProperty(mark, props.logoLetters),
        paddingX: resolveSvgProperty(mark, props.paddingX),
        paddingY: resolveSvgProperty(mark, props.paddingY),
        flushX: resolveSvgProperty(mark, props.flushX),
        flushY: resolveSvgProperty(mark, props.flushY),
        squeeze: resolveSvgProperty(mark, props.squeeze),
        dx: resolveSvgProperty(mark, props.dx),
        dy: resolveSvgProperty(mark, props.dy),
    };
}

/**
 * @param {import("../../marks/text.js").default} mark
 * @param {{coords: import("../../view/layout/rectangle.js").default, data: object[]}} options
 * @param {(anchor: TextAnchor) => boolean} visitor
 */
function visitTextAnchors(mark, options, visitor) {
    const { coords, data } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const channelDef = mark.encoding.text;
    const numberFormat =
        "format" in channelDef
            ? format(channelDef.format)
            : (/** @type {any} */ value) => value;
    let instanceCount = 0;

    for (const datum of data) {
        const value = numberFormat(encoders.text(datum));
        const text = isString(value) ? value : value === null ? "" : "" + value;
        if (!text) {
            continue;
        }
        const [x, x2] = projectXRange(coords, encoders, datum);
        const [y, y2] = projectYRange(coords, encoders, datum);
        if (
            visitor({
                datum,
                text,
                x,
                x2,
                y,
                y2,
                size: encodeNumber(encoders.size, datum),
                angle: encodeNumber(encoders.angle, datum),
                hasX2: !!encoders.x2,
                hasY2: !!encoders.y2,
            })
        ) {
            instanceCount++;
        }
    }
    return instanceCount;
}

/**
 * @typedef {object} TextInstance
 * @prop {object} datum
 * @prop {string} text
 * @prop {number} x
 * @prop {number} y
 * @prop {number} size
 * @prop {number} width
 * @prop {number} angle
 * @prop {number} dx
 * @prop {number} dy
 * @prop {number} fadeOpacity
 * @prop {number} scale
 * @prop {{width: number, heightScale: number} | undefined} logoScale
 * @prop {boolean} multiCharacterLogo
 */

/**
 * @param {import("../../marks/text.js").default} mark
 * @param {ReturnType<typeof resolveTextProperties>} properties
 * @param {{coords: import("../../view/layout/rectangle.js").default, data: object[], visibleBounds: import("../../svg/svgBounds.js").SvgBounds, anchorCullBounds: import("../../svg/svgBounds.js").SvgBounds}} options
 * @param {(instance: TextInstance) => void} visitor
 */
export function visitTextInstances(mark, properties, options, visitor) {
    const { coords, visibleBounds, anchorCullBounds } = options;
    const props = mark.properties;
    return visitTextAnchors(mark, options, (anchor) => {
        let { x, x2, y, y2 } = anchor;
        const { datum, text, size, angle, hasX2, hasY2 } = anchor;

        if (properties.logoLetters) {
            let width = size;
            let height = size;
            if (hasX2) {
                width = x2 - x;
                x = (x + x2) / 2;
            }
            if (hasY2) {
                height = y - y2;
                y = (y + y2) / 2;
            }
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
                    properties.dx,
                    properties.dy
                )
            ) {
                return false;
            }
            const glyph = mark.font.metrics.getChar(text[0]);
            const heightScale =
                (height *
                    mark.font.metrics.common.base *
                    (glyph.height + 2 * SDF_PADDING)) /
                (glyph.height * glyph.height);
            visitor({
                datum,
                text,
                x,
                y,
                size: 1,
                width: 1,
                angle,
                dx: properties.dx,
                dy: properties.dy,
                fadeOpacity: 1,
                scale: 1,
                logoScale: { width, heightScale },
                multiCharacterLogo: text.length > 1,
            });
            return true;
        }

        const measuredWidth = mark.font.metrics.measureWidth(text, size);
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
                properties.paddingX,
                rangeAlign.x,
                properties.flushX,
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
                properties.paddingY,
                rangeAlign.y,
                properties.flushY,
                coords.y,
                coords.y2
            );
            y = result.position;
            scale *= result.scale;
        }
        if (isOutsideSvgBounds(anchorCullBounds, x, y)) {
            return false;
        }
        let fadeOpacity = 1;
        if (scale < 1) {
            if (!properties.squeeze || scale < 3 / size) {
                return false;
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
                properties.dx,
                properties.dy
            )
        ) {
            return false;
        }
        visitor({
            datum,
            text,
            x,
            y,
            size: scaledSize,
            width: scaledWidth,
            angle,
            dx: properties.dx,
            dy: properties.dy,
            fadeOpacity,
            scale,
            logoScale: undefined,
            multiCharacterLogo: false,
        });
        return true;
    });
}

/**
 * @param {import("../../svg/svgBounds.js").SvgBounds} visibleBounds
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

/** @param {number} width @param {number} height @param {number} angleInDegrees */
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

const alignmentValues = { left: -1, center: 0, right: 1 };
const baselineValues = {
    top: -1,
    middle: 0,
    bottom: 1,
    alphabetic: 1,
    baseline: 1,
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
export function normalizeFontWeight(weight) {
    return typeof weight == "number"
        ? weight
        : fontWeights[/** @type {keyof typeof fontWeights} */ (weight)];
}
