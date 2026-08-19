import { intersectsBounds } from "../bounds.js";
import {
    encodeNumber,
    projectXRange,
    projectYRange,
    resolveMarkProperty,
    toPaintString,
} from "../markEncoding.js";

// Adjacent fills can expose hairline seams when rasterizers antialias each
// rectangle separately. Small symmetric padding covers shared boundaries.
const RECT_SEAM_PADDING = 0.1;

/**
 * @typedef {object} CornerRadii
 * @prop {number} topLeft
 * @prop {number} topRight
 * @prop {number} bottomRight
 * @prop {number} bottomLeft
 */

/**
 * @typedef {object} ResolvedRectProperties
 * @prop {CornerRadii} cornerRadii
 * @prop {number} minWidth
 * @prop {number} minHeight
 * @prop {number} minOpacity
 * @prop {{blur: number, color: string, offsetX: number, offsetY: number, opacity: number}} shadow
 * @prop {string} hatch
 * @prop {boolean} canPadSeams
 */

/**
 * @typedef {object} RectInstance
 * @prop {object} datum
 * @prop {number} x
 * @prop {number} y
 * @prop {number} width
 * @prop {number} height
 * @prop {CornerRadii} radii
 * @prop {number} opacityFactor
 * @prop {number} strokeWidth
 * @prop {string} fill
 * @prop {number} fillOpacity
 */

/**
 * Resolves expression-backed properties once per mark traversal.
 *
 * @param {import("../../../marks/rect.js").default} mark
 * @returns {ResolvedRectProperties}
 */
export function resolveRectProperties(mark) {
    const p = mark.properties;
    const defaultRadius = resolveMarkProperty(mark, p.cornerRadius);
    const cornerRadii = {
        topLeft: resolveMarkProperty(
            mark,
            p.cornerRadiusTopLeft ?? defaultRadius
        ),
        topRight: resolveMarkProperty(
            mark,
            p.cornerRadiusTopRight ?? defaultRadius
        ),
        bottomRight: resolveMarkProperty(
            mark,
            p.cornerRadiusBottomRight ?? defaultRadius
        ),
        bottomLeft: resolveMarkProperty(
            mark,
            p.cornerRadiusBottomLeft ?? defaultRadius
        ),
    };
    const shadow = {
        blur: resolveMarkProperty(mark, p.shadowBlur ?? 0),
        color: resolveMarkProperty(mark, p.shadowColor ?? "black"),
        offsetX: resolveMarkProperty(mark, p.shadowOffsetX ?? 0),
        offsetY: resolveMarkProperty(mark, p.shadowOffsetY ?? 0),
        opacity: resolveMarkProperty(mark, p.shadowOpacity ?? 0),
    };
    const hatch = resolveMarkProperty(mark, p.hatch ?? "none");

    return {
        cornerRadii,
        minWidth: resolveMarkProperty(mark, p.minWidth),
        minHeight: resolveMarkProperty(mark, p.minHeight),
        minOpacity: resolveMarkProperty(mark, p.minOpacity),
        shadow,
        hatch,
        canPadSeams:
            hatch == "none" &&
            shadow.opacity == 0 &&
            hasZeroCornerRadii(cornerRadii),
    };
}

/**
 * Visits visible rectangle instances using one mutable record. The visitor
 * must consume each record synchronously and must not retain it.
 *
 * @param {import("../../../marks/rect.js").default} mark
 * @param {ResolvedRectProperties} properties
 * @param {{
 *     coords: import("../../../view/layout/rectangle.js").default,
 *     data: object[],
 *     visibleBounds: import("../bounds.js").RenderBounds,
 *     viewOpacity: number
 * }} options
 * @param {(instance: RectInstance) => void} visitor
 * @returns {number}
 */
export function visitRectInstances(mark, properties, options, visitor) {
    const { coords, data, visibleBounds, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    if (data.length == 0) {
        return 0;
    }
    const constantStrokeWidth = encoders.strokeWidth.constant
        ? encodeNumber(encoders.strokeWidth, data[0])
        : 0;
    const constantFillOpacity = encoders.fillOpacity.constant
        ? encodeNumber(encoders.fillOpacity, data[0])
        : 0;
    const xRange = /** @type {[number, number]} */ ([0, 0]);
    const yRange = /** @type {[number, number]} */ ([0, 0]);
    /** @type {RectInstance} */
    const instance = {
        datum: {},
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        opacityFactor: 1,
        strokeWidth: 0,
        fill: "none",
        fillOpacity: 0,
    };
    let instanceCount = 0;

    for (const datum of data) {
        projectXRange(coords, encoders, datum, xRange);
        projectYRange(coords, encoders, datum, yRange);
        let x = Math.min(xRange[0], xRange[1]);
        let y = Math.min(yRange[0], yRange[1]);
        let width = Math.abs(xRange[1] - xRange[0]);
        let height = Math.abs(yRange[1] - yRange[0]);
        const widthFactor = getMinSizeFactor(width, properties.minWidth);
        const heightFactor = getMinSizeFactor(height, properties.minHeight);
        const opacityFactor = Math.max(
            properties.minOpacity,
            widthFactor * heightFactor
        );
        if (width < properties.minWidth) {
            x -= (properties.minWidth - width) / 2;
            width = properties.minWidth;
        }
        if (height < properties.minHeight) {
            y -= (properties.minHeight - height) / 2;
            height = properties.minHeight;
        }
        const strokeWidth = encoders.strokeWidth.constant
            ? constantStrokeWidth
            : encodeNumber(encoders.strokeWidth, datum);
        const fill = toPaintString(encoders.fill(datum));
        const fillOpacity =
            (encoders.fillOpacity.constant
                ? constantFillOpacity
                : encodeNumber(encoders.fillOpacity, datum)) * viewOpacity;
        const seamPadding =
            strokeWidth == 0 &&
            fillOpacity == 1 &&
            opacityFactor == 1 &&
            properties.canPadSeams &&
            fill != "none"
                ? RECT_SEAM_PADDING
                : 0;
        if (seamPadding) {
            x -= seamPadding;
            y -= seamPadding;
            width += seamPadding * 2;
            height += seamPadding * 2;
        }
        const shadowPadding =
            properties.shadow.opacity > 0
                ? properties.shadow.blur +
                  Math.max(
                      Math.abs(properties.shadow.offsetX),
                      Math.abs(properties.shadow.offsetY)
                  )
                : 0;
        if (
            !intersectsBounds(
                visibleBounds,
                x,
                y,
                x + width,
                y + height,
                strokeWidth / 2 + shadowPadding
            )
        ) {
            continue;
        }

        instanceCount++;
        instance.datum = datum;
        instance.x = x;
        instance.y = y;
        instance.width = width;
        instance.height = height;
        instance.opacityFactor = opacityFactor;
        instance.strokeWidth = strokeWidth;
        instance.fill = fill;
        instance.fillOpacity = fillOpacity;
        clampCornerRadii(properties.cornerRadii, width, height, instance.radii);
        visitor(instance);
    }
    return instanceCount;
}

/** @param {number} size @param {number} minSize */
function getMinSizeFactor(size, minSize) {
    return minSize > 0 && size < minSize ? size / minSize : 1;
}

/**
 * @param {CornerRadii} source
 * @param {number} width
 * @param {number} height
 * @param {CornerRadii} target
 */
function clampCornerRadii(source, width, height, target) {
    const maxRadius = Math.min(width, height) / 2;
    target.topLeft = Math.max(0, Math.min(source.topLeft, maxRadius));
    target.topRight = Math.max(0, Math.min(source.topRight, maxRadius));
    target.bottomRight = Math.max(0, Math.min(source.bottomRight, maxRadius));
    target.bottomLeft = Math.max(0, Math.min(source.bottomLeft, maxRadius));
}

/** @param {CornerRadii} radii */
function hasZeroCornerRadii(radii) {
    return (
        radii.topLeft == 0 &&
        radii.topRight == 0 &&
        radii.bottomRight == 0 &&
        radii.bottomLeft == 0
    );
}
