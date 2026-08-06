import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { createSvgElement } from "../svgElement.js";
import {
    createSvgAttributeEncoder,
    encodeNumber,
    encodePosition,
    formatSvgNumber,
    toSvgString,
} from "../svgMarkUtils.js";

/**
 * @param {import("../../marks/mark.js").default} baseMark
 * @param {import("../svgViewRenderingContext.js").SvgMarkRenderingOptions} options
 */
export function renderLinkSvg(baseMark, options) {
    const mark = /** @type {import("../../marks/link.js").default} */ (
        baseMark
    );
    const props = mark.properties;
    const arcFadingDistance = requireConstantProperty(
        props.arcFadingDistance,
        "arcFadingDistance"
    );
    if (
        arcFadingDistance !== false &&
        arcFadingDistance[0] > 0 &&
        arcFadingDistance[1] > 0
    ) {
        throw new Error("SVG export does not support link arc fading yet.");
    }

    const shape = requireConstantProperty(props.linkShape, "linkShape");
    const orient = requireConstantProperty(props.orient, "orient");
    const geometryOptions = {
        shape,
        orient,
        arcHeightFactor: requireConstantProperty(
            props.arcHeightFactor,
            "arcHeightFactor"
        ),
        minArcHeight: requireConstantProperty(
            props.minArcHeight,
            "minArcHeight"
        ),
        maxChordLength: requireConstantProperty(
            props.maxChordLength,
            "maxChordLength"
        ),
        clampApex: requireConstantProperty(props.clampApex, "clampApex"),
    };
    const { coords, data, group, viewOpacity } = options;
    const encoders =
        /** @type {Record<string, import("../../types/encoder.js").Encoder>} */ (
            mark.encoders
        );
    const encodeStyles = createSvgAttributeEncoder(group, {
        stroke: { encoder: encoders.color, transform: toSvgString },
        "stroke-opacity": {
            encoder: encoders.opacity,
            transform: (value) => +value * viewOpacity,
        },
        "stroke-width": {
            encoder: encoders.size,
            transform: (value) => formatSvgNumber(+value),
        },
    });
    group.setAttribute("fill", "none");
    group.setAttribute("stroke-linecap", "butt");

    for (const datum of data) {
        const xOffset = encodeNumber(encoders.xOffset, datum);
        const yOffset = encodeNumber(encoders.yOffset, datum);
        const a = [
            encodePosition(encoders.x, datum) * coords.width + xOffset,
            encodePosition(encoders.y, datum) * coords.height - yOffset,
        ];
        const b = [
            encodePosition(encoders.x2, datum) * coords.width +
                (encoders.x2Offset
                    ? encodeNumber(encoders.x2Offset, datum)
                    : xOffset),
            encodePosition(encoders.y2, datum) * coords.height -
                (encoders.y2Offset
                    ? encodeNumber(encoders.y2Offset, datum)
                    : yOffset),
        ];
        const points = getBezierPoints(
            /** @type {[number, number]} */ (a),
            /** @type {[number, number]} */ (b),
            { width: coords.width, height: coords.height },
            geometryOptions
        ).map(([x, y]) => [coords.x + x, coords.y + coords.height - y]);
        const [p1, p2, p3, p4] = points;
        group.appendChild(
            createSvgElement("path", {
                d: `M ${formatSvgPoint(p1)} C ${formatSvgPoint(p2)} ${formatSvgPoint(p3)} ${formatSvgPoint(p4)}`,
                ...encodeStyles(datum),
            })
        );
    }
}

/** @param {number[]} point */
function formatSvgPoint(point) {
    return point.map(formatSvgNumber).join(" ");
}

/**
 * @typedef {object} LinkGeometryOptions
 * @prop {"arc" | "dome" | "diagonal" | "line"} shape
 * @prop {"vertical" | "horizontal"} orient
 * @prop {number} arcHeightFactor
 * @prop {number} minArcHeight
 * @prop {number} maxChordLength
 * @prop {boolean} clampApex
 */

/**
 * Computes the same cubic Bézier control points as the link vertex shader.
 * Coordinates use a bottom-left origin and logical pixels.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {{width: number, height: number}} viewport
 * @param {LinkGeometryOptions} options
 * @returns {[[number, number], [number, number], [number, number], [number, number]]}
 */
export function getBezierPoints(a, b, viewport, options) {
    if (options.shape == "arc") {
        const p1 = /** @type {[number, number]} */ ([...a]);
        const p4 = /** @type {[number, number]} */ ([...b]);
        const chord = subtract(p4, p1);
        let chordLength = length(chord);
        if (chordLength == 0) {
            return [p1, p1, p4, p4];
        }
        const unitChord = scale(chord, 1 / chordLength);
        const normal = /** @type {[number, number]} */ ([
            -unitChord[1],
            unitChord[0],
        ]);
        chordLength = clampChordToViewport(
            p1,
            p4,
            chordLength,
            options.maxChordLength,
            viewport
        );
        const height = Math.max(
            (chordLength / 2) * options.arcHeightFactor,
            options.minArcHeight
        );
        const controlOffset = scale(normal, height / 0.75);
        return [p1, add(p1, controlOffset), add(p4, controlOffset), p4];
    } else if (options.shape == "dome") {
        /** @type {[number, number]} */
        let p1;
        /** @type {[number, number]} */
        let p4;
        /** @type {[number, number]} */
        let height;

        if (options.orient == "vertical") {
            p1 = [Math.min(a[0], b[0]), b[1]];
            p4 = [Math.max(a[0], b[0]), b[1]];
            height = [0, a[1] - b[1]];
        } else {
            p1 = [b[0], Math.min(a[1], b[1])];
            p4 = [b[0], Math.max(a[1], b[1])];
            height = [a[0] - b[0], 0];
        }

        const chordLength = length(subtract(p4, p1));
        clampChordToViewport(
            p1,
            p4,
            chordLength,
            options.maxChordLength,
            viewport
        );
        if (options.clampApex) {
            clampDomeApex(p1, p4, options.orient, viewport);
        }
        const controlOffset = scale(height, 1 / 0.75);
        return [p1, add(p1, controlOffset), add(p4, controlOffset), p4];
    } else if (options.shape == "diagonal") {
        if (options.orient == "vertical") {
            const middle = (a[1] + b[1]) / 2;
            return [a, [a[0], middle], [b[0], middle], b];
        } else {
            const middle = (a[0] + b[0]) / 2;
            return [a, [middle, a[1]], [middle, b[1]], b];
        }
    } else if (options.shape == "line") {
        const middle = scale(add(a, b), 0.5);
        return [a, middle, middle, b];
    } else {
        throw new Error(`Unsupported link shape: ${options.shape}`);
    }
}

/**
 * @template T
 * @param {T | import("../../spec/parameter.js").ExprRef} value
 * @param {string} name
 * @returns {T}
 */
function requireConstantProperty(value, name) {
    if (isExprRef(value)) {
        throw new Error(
            `SVG export does not support expression-valued link property "${name}" yet.`
        );
    }
    return value;
}

/**
 * @param {[number, number]} p1
 * @param {[number, number]} p4
 * @param {number} chordLength
 * @param {number} maxChordLength
 * @param {{width: number, height: number}} viewport
 */
function clampChordToViewport(p1, p4, chordLength, maxChordLength, viewport) {
    if (chordLength <= maxChordLength) {
        return chordLength;
    }

    const unitChord = scale(subtract(p4, p1), 1 / chordLength);
    if (isInsideViewport(p1, viewport, 2)) {
        copyPoint(p4, add(p1, scale(unitChord, maxChordLength)));
        return maxChordLength;
    } else if (isInsideViewport(p4, viewport, 2)) {
        copyPoint(p1, subtract(p4, scale(unitChord, maxChordLength)));
        return maxChordLength;
    } else {
        return chordLength;
    }
}

/**
 * @param {[number, number]} p1
 * @param {[number, number]} p4
 * @param {"vertical" | "horizontal"} orient
 * @param {{width: number, height: number}} viewport
 */
function clampDomeApex(p1, p4, orient, viewport) {
    if (orient == "vertical") {
        if (p4[0] > 0) {
            p1[0] = Math.max(p1[0], -p4[0]);
        }
        if (p1[0] < viewport.width) {
            p4[0] = Math.min(p4[0], 2 * viewport.width - p1[0]);
        }
    } else {
        if (p4[1] > 0) {
            p1[1] = Math.max(p1[1], -p4[1]);
        }
        if (p1[1] < viewport.height) {
            p4[1] = Math.min(p4[1], 2 * viewport.height - p1[1]);
        }
    }
}

/**
 * @param {[number, number]} point
 * @param {{width: number, height: number}} viewport
 * @param {number} marginFactor
 */
function isInsideViewport(point, viewport, marginFactor) {
    return (
        point[0] >= -viewport.width * marginFactor &&
        point[0] <= viewport.width * (1 + marginFactor) &&
        point[1] >= -viewport.height * marginFactor &&
        point[1] <= viewport.height * (1 + marginFactor)
    );
}

/** @param {[number, number]} a @param {[number, number]} b */
function add(a, b) {
    return /** @type {[number, number]} */ ([a[0] + b[0], a[1] + b[1]]);
}

/** @param {[number, number]} a @param {[number, number]} b */
function subtract(a, b) {
    return /** @type {[number, number]} */ ([a[0] - b[0], a[1] - b[1]]);
}

/** @param {[number, number]} a @param {number} scalar */
function scale(a, scalar) {
    return /** @type {[number, number]} */ ([a[0] * scalar, a[1] * scalar]);
}

/** @param {[number, number]} a */
function length(a) {
    return Math.hypot(a[0], a[1]);
}

/** @param {[number, number]} target @param {[number, number]} source */
function copyPoint(target, source) {
    target[0] = source[0];
    target[1] = source[1];
}
