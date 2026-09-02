import { svgPathToGlyphPath } from "../vendor/vegaScenegraph/toGlyphPath.js";

export const DEFAULT_SPARSE_PATH_ATLAS_OPTIONS = Object.freeze({
    tileSize: 128,
    spread: 32,
    shapePadding: 40,
    gutter: 1,
    cubicTolerance: 0.25,
});

const EDGE_LINE = 0;
const EDGE_QUADRATIC = 1;
const CORNER_CROSS_THRESHOLD = Math.sin(3);
const MAX_CUBIC_DEPTH = 12;
const MAX_MITER_PADDING = 4;

/** @typedef {{ x: number, y: number }} Point */
/**
 * @typedef {object} SourceEdge
 * @property {"line" | "quadratic" | "cubic"} kind
 * @property {Point} p0
 * @property {Point} p1
 * @property {Point} p2
 * @property {Point} [p3]
 * @property {number} colorMask
 * @property {number} startPseudoMask
 * @property {number} endPseudoMask
 * @property {Point} startPseudoDomain
 * @property {Point} endPseudoDomain
 */

/**
 * @typedef {object} SparsePathSegment
 * @property {Point} p0
 * @property {Point} p1
 * @property {Point} p2
 * @property {number} kind
 * @property {number} colorMask
 * @property {number} startPseudoMask
 * @property {number} endPseudoMask
 * @property {Point} startPseudoDomain
 * @property {Point} endPseudoDomain
 * @property {number} jobIndex
 */

/**
 * @typedef {object} SparsePathJob
 * @property {number} edgeOffset
 * @property {number} edgeCount
 * @property {number} slotX
 * @property {number} slotY
 * @property {number} slotWidth
 * @property {number} slotHeight
 * @property {number} tileWidth
 * @property {number} tileHeight
 * @property {number} gutter
 */

/** @param {Point} a @param {Point} b */
function samePoint(a, b) {
    return Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9;
}

/** @param {Point} a @param {Point} b */
function midpoint(a, b) {
    return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

/** @param {Point} a @param {Point} b */
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** @param {Point} vector */
function normalize(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (length <= 1e-12) {
        return null;
    }
    return { x: vector.x / length, y: vector.y / length };
}

/** @param {Point} a @param {Point} b */
function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

/** @param {Point} a @param {Point} b */
function cross(a, b) {
    return a.x * b.y - a.y * b.x;
}

/** @param {Point} a @param {Point} b */
function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

/** @param {Point} incoming @param {Point} outgoing */
function isCorner(incoming, outgoing) {
    return (
        dot(incoming, outgoing) <= 0 ||
        Math.abs(cross(incoming, outgoing)) > CORNER_CROSS_THRESHOLD
    );
}

/** @param {Point} a @param {Point} b */
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Split a parsed path into explicit closed contours.
 *
 * @param {import("./pathTypes.js").GlyphPath} path
 * @returns {SourceEdge[][]}
 */
function collectContours(path) {
    /** @type {SourceEdge[][]} */
    const contours = [];
    /** @type {SourceEdge[] | null} */
    let contour = null;
    /** @type {Point | null} */
    let current = null;
    /** @type {Point | null} */
    let first = null;

    for (const command of path.commands) {
        if (command.type === "M") {
            if (contour) {
                throw new Error("Sparse path atlas requires closed contours.");
            }
            current = { x: command.x, y: command.y };
            first = current;
            contour = [];
        } else if (command.type === "L") {
            if (!contour || !current) {
                throw new Error("Sparse path atlas edge requires a move.");
            }
            const end = { x: command.x, y: command.y };
            if (!samePoint(current, end)) {
                contour.push({
                    kind: "line",
                    p0: current,
                    p1: midpoint(current, end),
                    p2: end,
                    colorMask: 0,
                    startPseudoMask: 0,
                    endPseudoMask: 0,
                    startPseudoDomain: { x: 0, y: 0 },
                    endPseudoDomain: { x: 0, y: 0 },
                });
            }
            current = end;
        } else if (command.type === "Q") {
            if (!contour || !current) {
                throw new Error("Sparse path atlas edge requires a move.");
            }
            const end = { x: command.x, y: command.y };
            contour.push({
                kind: "quadratic",
                p0: current,
                p1: { x: command.x1, y: command.y1 },
                p2: end,
                colorMask: 0,
                startPseudoMask: 0,
                endPseudoMask: 0,
                startPseudoDomain: { x: 0, y: 0 },
                endPseudoDomain: { x: 0, y: 0 },
            });
            current = end;
        } else if (command.type === "C") {
            if (!contour || !current) {
                throw new Error("Sparse path atlas edge requires a move.");
            }
            const end = { x: command.x, y: command.y };
            contour.push({
                kind: "cubic",
                p0: current,
                p1: { x: command.x1, y: command.y1 },
                p2: { x: command.x2, y: command.y2 },
                p3: end,
                colorMask: 0,
                startPseudoMask: 0,
                endPseudoMask: 0,
                startPseudoDomain: { x: 0, y: 0 },
                endPseudoDomain: { x: 0, y: 0 },
            });
            current = end;
        } else if (command.type === "Z") {
            if (!contour || !current || !first) {
                throw new Error("Sparse path atlas close requires a contour.");
            }
            if (!samePoint(current, first)) {
                contour.push({
                    kind: "line",
                    p0: current,
                    p1: midpoint(current, first),
                    p2: first,
                    colorMask: 0,
                    startPseudoMask: 0,
                    endPseudoMask: 0,
                    startPseudoDomain: { x: 0, y: 0 },
                    endPseudoDomain: { x: 0, y: 0 },
                });
            }
            if (contour.length === 0) {
                throw new Error(
                    "Sparse path atlas contours must contain visible edges."
                );
            }
            contours.push(contour);
            contour = null;
            current = null;
            first = null;
        }
    }

    if (contour) {
        throw new Error("Sparse path atlas requires closed contours.");
    }
    if (contours.length === 0) {
        throw new Error("Sparse path atlas requires visible contours.");
    }
    return contours;
}

/** @param {SourceEdge} edge */
function startTangent(edge) {
    const primary = subtract(edge.p1, edge.p0);
    return normalize(primary) ?? normalize(subtract(edge.p2, edge.p0));
}

/** @param {SourceEdge} edge */
function endTangent(edge) {
    if (edge.kind === "cubic") {
        return (
            normalize(subtract(/** @type {Point} */ (edge.p3), edge.p2)) ??
            normalize(subtract(/** @type {Point} */ (edge.p3), edge.p0))
        );
    }
    if (edge.kind === "quadratic") {
        return (
            normalize(subtract(edge.p2, edge.p1)) ??
            normalize(subtract(edge.p2, edge.p0))
        );
    }
    return normalize(subtract(edge.p2, edge.p0));
}

/**
 * Return the unit outward normal for a directed contour edge. Positive
 * orientation has its interior on the left, and negative orientation on the
 * right.
 *
 * @param {Point} direction
 * @param {number} orientation
 */
function outwardNormal(direction, orientation) {
    return orientation > 0
        ? { x: direction.y, y: -direction.x }
        : { x: -direction.y, y: direction.x };
}

/**
 * Compute normalized draw bounds and directional padding for a unit-width
 * outward mitered stroke. Padding components are capped at the SVG default
 * miter-limit extent, matching the previous conservative quad bound.
 *
 * @param {import("./pathTypes.js").GlyphPath} path
 * @param {SourceEdge[][]} contours
 * @param {number} [normalizationSpan]
 */
function computePathDrawMetadata(path, contours, normalizationSpan) {
    const bounds = /** @type {NonNullable<typeof path.bounds>} */ (path.bounds);
    const width = bounds.xMax - bounds.xMin;
    const height = bounds.yMax - bounds.yMin;
    const maxSpan = normalizationSpan ?? Math.max(width, height);
    const localBounds = [
        -width / maxSpan / 2,
        -height / maxSpan / 2,
        width / maxSpan / 2,
        height / maxSpan / 2,
    ];
    const strokePadding = [1, 1, 1, 1];

    for (const contour of contours) {
        const orientation = Math.sign(
            contour.reduce(
                (area, edge) => area + cross(edge.p0, edge.p3 ?? edge.p2),
                0
            )
        );
        if (orientation === 0) {
            continue;
        }
        for (let index = 0; index < contour.length; index++) {
            const previous =
                contour[(index + contour.length - 1) % contour.length];
            const edge = contour[index];
            const incoming = endTangent(previous);
            const outgoing = startTangent(edge);
            if (
                !incoming ||
                !outgoing ||
                !isCorner(incoming, outgoing) ||
                cross(incoming, outgoing) * orientation <= 1e-9
            ) {
                continue;
            }
            const incomingNormal = outwardNormal(incoming, orientation);
            const outgoingNormal = outwardNormal(outgoing, orientation);
            const miterDirection = normalize(
                add(incomingNormal, outgoingNormal)
            );
            const denominator = miterDirection
                ? dot(miterDirection, outgoingNormal)
                : 0;
            if (!(denominator > 1e-9)) {
                continue;
            }
            const miter = {
                x: Math.max(
                    -MAX_MITER_PADDING,
                    Math.min(MAX_MITER_PADDING, miterDirection.x / denominator)
                ),
                y: Math.max(
                    -MAX_MITER_PADDING,
                    Math.min(MAX_MITER_PADDING, miterDirection.y / denominator)
                ),
            };
            strokePadding[0] = Math.max(strokePadding[0], -miter.x);
            strokePadding[1] = Math.max(strokePadding[1], -miter.y);
            strokePadding[2] = Math.max(strokePadding[2], miter.x);
            strokePadding[3] = Math.max(strokePadding[3], miter.y);
        }
    }

    return { localBounds, strokePadding };
}

/**
 * Compute the draw metadata shared by the GPU and canonical WASM atlases.
 *
 * @param {import("./pathTypes.js").GlyphPath} path
 * @param {number} [normalizationSpan]
 */
export function getPathDrawMetadata(path, normalizationSpan) {
    return computePathDrawMetadata(
        path,
        collectContours(path),
        normalizationSpan
    );
}

// Focused adaptation of msdfgen v1.13 edgeColoringSimple (MIT):
// https://github.com/Chlumsky/msdfgen/blob/v1.13/core/edge-coloring.cpp
/** @param {number} color @param {number} [banned] */
function switchColor(color, banned = 0) {
    const combined = color & banned;
    if (combined === 1 || combined === 2 || combined === 4) {
        return combined ^ 7;
    }
    const shifted = color << 1;
    return (shifted | (shifted >> 3)) & 7;
}

/** @param {number} position @param {number} count */
function symmetricalTrichotomy(position, count) {
    return Math.floor(3 + (2.875 * position) / (count - 1) - 1.4375 + 0.5) - 3;
}

/**
 * @param {SourceEdge[]} contour
 * @param {{ colorMask: number }} colorState
 * @returns {boolean[]}
 */
function colorContour(contour, colorState) {
    const corners = contour.map((edge, index) => {
        const previous = contour[(index + contour.length - 1) % contour.length];
        const incoming = endTangent(previous);
        const outgoing = startTangent(edge);
        if (!incoming || !outgoing) {
            return true;
        }
        return isCorner(incoming, outgoing);
    });
    const cornerIndices = corners.flatMap((corner, index) =>
        corner ? [index] : []
    );
    if (cornerIndices.length === 0) {
        colorState.colorMask = switchColor(colorState.colorMask);
        for (const edge of contour) {
            edge.colorMask = colorState.colorMask;
        }
        return corners;
    }

    if (cornerIndices.length === 1) {
        colorState.colorMask = switchColor(colorState.colorMask);
        const colors = [colorState.colorMask, 7];
        colorState.colorMask = switchColor(colorState.colorMask);
        colors.push(colorState.colorMask);
        const corner = cornerIndices[0];
        if (contour.length < 3) {
            for (const edge of contour) {
                edge.colorMask = 7;
            }
        } else {
            for (let offset = 0; offset < contour.length; offset++) {
                const colorIndex =
                    1 + symmetricalTrichotomy(offset, contour.length);
                contour[(corner + offset) % contour.length].colorMask =
                    colors[colorIndex];
            }
        }
        return corners;
    }

    colorState.colorMask = switchColor(colorState.colorMask);
    const initialColor = colorState.colorMask;
    let spline = 0;
    const start = cornerIndices[0];
    for (let offset = 0; offset < contour.length; offset++) {
        const index = (start + offset) % contour.length;
        if (
            spline + 1 < cornerIndices.length &&
            cornerIndices[spline + 1] === index
        ) {
            spline++;
            const banned =
                spline === cornerIndices.length - 1 ? initialColor : 0;
            colorState.colorMask = switchColor(colorState.colorMask, banned);
        }
        contour[index].colorMask = colorState.colorMask;
    }
    return corners;
}

/**
 * Mark channels whose edge distance must continue perpendicularly past a
 * sharp endpoint. On either side of the corner bisector, all channels of the
 * incident edge use its perpendicular distance. This follows msdfgen's
 * perpendicular-distance selector: two corrected channels outvote the radial
 * endpoint distance while the bisector bounds the correction to the miter.
 *
 * @param {SourceEdge[]} contour
 * @param {boolean[]} corners
 */
function assignPseudoDistanceMasks(contour, corners) {
    for (let index = 0; index < contour.length; index++) {
        const previous = contour[(index + contour.length - 1) % contour.length];
        const edge = contour[index];
        const next = contour[(index + 1) % contour.length];
        const previousDirection = endTangent(previous);
        const startDirection = startTangent(edge);
        const endDirection = endTangent(edge);
        const nextDirection = startTangent(next);
        const startDomain =
            corners[index] && previousDirection && startDirection
                ? normalize(add(previousDirection, startDirection))
                : null;
        const endDomain =
            corners[(index + 1) % contour.length] &&
            endDirection &&
            nextDirection
                ? normalize(add(endDirection, nextDirection))
                : null;
        edge.startPseudoDomain = startDomain ?? { x: 0, y: 0 };
        edge.endPseudoDomain = endDomain ?? { x: 0, y: 0 };
        edge.startPseudoMask = startDomain ? edge.colorMask : 0;
        edge.endPseudoMask = endDomain ? edge.colorMask : 0;
    }
}

/** @param {Point} point @param {number} scale @param {number} x @param {number} y */
function transformPoint(point, scale, x, y) {
    return { x: x + point.x * scale, y: y + point.y * scale };
}

/** @param {Point} p0 @param {Point} p1 @param {Point} p2 @param {Point} p3 */
function splitCubic(p0, p1, p2, p3) {
    const p01 = midpoint(p0, p1);
    const p12 = midpoint(p1, p2);
    const p23 = midpoint(p2, p3);
    const p012 = midpoint(p01, p12);
    const p123 = midpoint(p12, p23);
    const center = midpoint(p012, p123);
    return [
        [p0, p01, p012, center],
        [center, p123, p23, p3],
    ];
}

/** @param {Point} p0 @param {Point} p1 @param {Point} p2 @param {Point} p3 */
function reduceCubic(p0, p1, p2, p3) {
    const control = {
        x: (3 * (p1.x + p2.x) - p0.x - p3.x) * 0.25,
        y: (3 * (p1.y + p2.y) - p0.y - p3.y) * 0.25,
    };
    const elevated1 = {
        x: (p0.x + 2 * control.x) / 3,
        y: (p0.y + 2 * control.y) / 3,
    };
    const elevated2 = {
        x: (2 * control.x + p3.x) / 3,
        y: (2 * control.y + p3.y) / 3,
    };
    return {
        control,
        error: Math.max(distance(p1, elevated1), distance(p2, elevated2)),
    };
}

/**
 * @param {Point} p0
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @param {number} tolerance
 * @param {number} colorMask
 * @param {number} startPseudoMask
 * @param {number} endPseudoMask
 * @param {Point} startPseudoDomain
 * @param {Point} endPseudoDomain
 * @param {number} jobIndex
 * @param {SparsePathSegment[]} output
 * @param {number} [depth]
 */
function approximateCubic(
    p0,
    p1,
    p2,
    p3,
    tolerance,
    colorMask,
    startPseudoMask,
    endPseudoMask,
    startPseudoDomain,
    endPseudoDomain,
    jobIndex,
    output,
    depth = 0
) {
    const reduced = reduceCubic(p0, p1, p2, p3);
    if (reduced.error <= tolerance || depth >= MAX_CUBIC_DEPTH) {
        output.push({
            p0,
            p1: reduced.control,
            p2: p3,
            kind: EDGE_QUADRATIC,
            colorMask,
            startPseudoMask,
            endPseudoMask,
            startPseudoDomain,
            endPseudoDomain,
            jobIndex,
        });
        return;
    }
    const [left, right] = splitCubic(p0, p1, p2, p3);
    approximateCubic(
        left[0],
        left[1],
        left[2],
        left[3],
        tolerance,
        colorMask,
        startPseudoMask,
        0,
        startPseudoDomain,
        { x: 0, y: 0 },
        jobIndex,
        output,
        depth + 1
    );
    approximateCubic(
        right[0],
        right[1],
        right[2],
        right[3],
        tolerance,
        colorMask,
        0,
        endPseudoMask,
        { x: 0, y: 0 },
        endPseudoDomain,
        jobIndex,
        output,
        depth + 1
    );
}

/** @param {SparsePathSegment[]} segments */
function packSegments(segments) {
    const buffer = new ArrayBuffer(segments.length * 64);
    const view = new DataView(buffer);
    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const offset = index * 64;
        const coordinates = [
            segment.p0.x,
            segment.p0.y,
            segment.p1.x,
            segment.p1.y,
            segment.p2.x,
            segment.p2.y,
            0,
            0,
        ];
        for (
            let coordinate = 0;
            coordinate < coordinates.length;
            coordinate++
        ) {
            view.setFloat32(
                offset + coordinate * 4,
                coordinates[coordinate],
                true
            );
        }
        view.setFloat32(offset + 32, segment.startPseudoDomain.x, true);
        view.setFloat32(offset + 36, segment.startPseudoDomain.y, true);
        view.setFloat32(offset + 40, segment.endPseudoDomain.x, true);
        view.setFloat32(offset + 44, segment.endPseudoDomain.y, true);
        view.setUint32(offset + 48, segment.kind, true);
        view.setUint32(offset + 52, segment.colorMask, true);
        view.setUint32(offset + 56, segment.jobIndex, true);
        view.setUint32(
            offset + 60,
            segment.startPseudoMask | (segment.endPseudoMask << 3),
            true
        );
    }
    return buffer;
}

/** @param {SparsePathJob[]} jobs */
function packJobs(jobs) {
    const buffer = new ArrayBuffer(jobs.length * 32);
    const view = new DataView(buffer);
    for (let index = 0; index < jobs.length; index++) {
        const job = jobs[index];
        const offset = index * 32;
        const values = [
            job.edgeOffset,
            job.edgeCount,
            job.slotX,
            job.slotY,
            job.slotWidth,
            job.slotHeight,
            job.gutter,
            0,
        ];
        for (let value = 0; value < values.length; value++) {
            view.setUint32(offset + value * 4, values[value], true);
        }
    }
    return buffer;
}

/**
 * @param {{ slotWidth: number, slotHeight: number }[]} rectangles
 * @param {number | undefined} requestedWidth
 */
function packRectangles(rectangles, requestedWidth) {
    const totalArea = rectangles.reduce(
        (sum, rectangle) => sum + rectangle.slotWidth * rectangle.slotHeight,
        0
    );
    const widest = Math.max(...rectangles.map((entry) => entry.slotWidth));
    const targetWidth =
        requestedWidth ?? Math.max(widest, Math.ceil(Math.sqrt(totalArea)));
    if (!Number.isInteger(targetWidth) || targetWidth < widest) {
        throw new Error("Invalid sparse path atlas packing width.");
    }
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let width = 0;
    return {
        placements: rectangles.map((rectangle) => {
            if (x > 0 && x + rectangle.slotWidth > targetWidth) {
                x = 0;
                y += rowHeight;
                rowHeight = 0;
            }
            const placement = { x, y };
            x += rectangle.slotWidth;
            rowHeight = Math.max(rowHeight, rectangle.slotHeight);
            width = Math.max(width, x);
            return placement;
        }),
        get width() {
            return width;
        },
        get height() {
            return y + rowHeight;
        },
    };
}

/**
 * Build the CPU metadata for sparse GPU path-atlas generation.
 *
 * @param {string[]} paths
 * @param {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, cubicTolerance?: number, normalizationSpan?: number, tightPacking?: boolean, maxAtlasWidth?: number }} [options]
 */
export function buildSparsePathAtlasLayout(paths, options = {}) {
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error("Sparse path atlas requires a non-empty paths array.");
    }
    const tileSize =
        options.tileSize ?? DEFAULT_SPARSE_PATH_ATLAS_OPTIONS.tileSize;
    const spread = options.spread ?? DEFAULT_SPARSE_PATH_ATLAS_OPTIONS.spread;
    const shapePadding =
        options.shapePadding ?? DEFAULT_SPARSE_PATH_ATLAS_OPTIONS.shapePadding;
    const gutter = options.gutter ?? DEFAULT_SPARSE_PATH_ATLAS_OPTIONS.gutter;
    const cubicTolerance =
        options.cubicTolerance ??
        DEFAULT_SPARSE_PATH_ATLAS_OPTIONS.cubicTolerance;
    const normalizationSpan = options.normalizationSpan;
    const tightPacking = options.tightPacking ?? false;
    const shapePixels = tileSize - shapePadding * 2;
    if (
        !Number.isInteger(tileSize) ||
        tileSize <= 0 ||
        shapePixels <= 0 ||
        spread <= 0 ||
        spread > shapePadding ||
        !Number.isInteger(gutter) ||
        gutter < 1 ||
        cubicTolerance <= 0 ||
        (normalizationSpan !== undefined && !(normalizationSpan > 0))
    ) {
        throw new Error("Invalid sparse path atlas dimensions.");
    }

    for (const path of paths) {
        if (typeof path !== "string" || path.trim() === "") {
            throw new Error("Sparse path atlas paths must be SVG strings.");
        }
    }

    const uniquePaths = Array.from(new Set(paths));
    const slotSize = tileSize + gutter * 2;
    const columns = Math.ceil(Math.sqrt(uniquePaths.length));
    const preparedPaths = uniquePaths.map((pathString) => {
        const path = svgPathToGlyphPath(pathString);
        if (!path.bounds) {
            throw new Error("Sparse path atlas path must have visible bounds.");
        }
        const pathWidth = path.bounds.xMax - path.bounds.xMin;
        const pathHeight = path.bounds.yMax - path.bounds.yMin;
        const maxSpan = Math.max(pathWidth, pathHeight);
        if (!(maxSpan > 0)) {
            throw new Error(
                "Sparse path atlas path must have non-zero bounds."
            );
        }
        const scale = shapePixels / (normalizationSpan ?? maxSpan);
        const tileWidth = tightPacking
            ? Math.max(1, Math.ceil(pathWidth * scale + shapePadding * 2))
            : tileSize;
        const tileHeight = tightPacking
            ? Math.max(1, Math.ceil(pathHeight * scale + shapePadding * 2))
            : tileSize;
        return {
            pathString,
            path,
            pathWidth,
            pathHeight,
            scale,
            tileWidth,
            tileHeight,
            slotWidth: tileWidth + gutter * 2,
            slotHeight: tileHeight + gutter * 2,
        };
    });
    const compactPacking = tightPacking
        ? packRectangles(preparedPaths, options.maxAtlasWidth)
        : null;
    const rows = Math.ceil(uniquePaths.length / columns);
    const width = compactPacking?.width ?? columns * slotSize;
    const height = compactPacking?.height ?? rows * slotSize;
    /** @type {SparsePathSegment[]} */
    const segments = [];
    /** @type {SparsePathJob[]} */
    const jobs = [];
    const entryByPath = new Map();

    for (let jobIndex = 0; jobIndex < uniquePaths.length; jobIndex++) {
        const prepared = preparedPaths[jobIndex];
        const {
            pathString,
            path,
            pathWidth,
            pathHeight,
            scale,
            tileWidth,
            tileHeight,
            slotWidth,
            slotHeight,
        } = prepared;
        const column = jobIndex % columns;
        const row = Math.floor(jobIndex / columns);
        const slotX =
            compactPacking?.placements[jobIndex].x ?? column * slotSize;
        const slotY = compactPacking?.placements[jobIndex].y ?? row * slotSize;
        const offsetX =
            slotX +
            gutter +
            (tileWidth - pathWidth * scale) * 0.5 -
            path.bounds.xMin * scale;
        const offsetY =
            slotY +
            gutter +
            (tileHeight - pathHeight * scale) * 0.5 -
            path.bounds.yMin * scale;
        const edgeOffset = segments.length;
        const contours = collectContours(path);
        const colorState = { colorMask: 6 };

        for (const contour of contours) {
            const corners = colorContour(contour, colorState);
            assignPseudoDistanceMasks(contour, corners);
            for (const edge of contour) {
                const p0 = transformPoint(edge.p0, scale, offsetX, offsetY);
                const p1 = transformPoint(edge.p1, scale, offsetX, offsetY);
                const p2 = transformPoint(edge.p2, scale, offsetX, offsetY);
                if (edge.kind === "line") {
                    segments.push({
                        p0,
                        p1,
                        p2,
                        kind: EDGE_LINE,
                        colorMask: edge.colorMask,
                        startPseudoMask: edge.startPseudoMask,
                        endPseudoMask: edge.endPseudoMask,
                        startPseudoDomain: edge.startPseudoDomain,
                        endPseudoDomain: edge.endPseudoDomain,
                        jobIndex,
                    });
                } else if (edge.kind === "quadratic") {
                    segments.push({
                        p0,
                        p1,
                        p2,
                        kind: EDGE_QUADRATIC,
                        colorMask: edge.colorMask,
                        startPseudoMask: edge.startPseudoMask,
                        endPseudoMask: edge.endPseudoMask,
                        startPseudoDomain: edge.startPseudoDomain,
                        endPseudoDomain: edge.endPseudoDomain,
                        jobIndex,
                    });
                } else {
                    const p3 = transformPoint(
                        /** @type {Point} */ (edge.p3),
                        scale,
                        offsetX,
                        offsetY
                    );
                    approximateCubic(
                        p0,
                        p1,
                        p2,
                        p3,
                        cubicTolerance,
                        edge.colorMask,
                        edge.startPseudoMask,
                        edge.endPseudoMask,
                        edge.startPseudoDomain,
                        edge.endPseudoDomain,
                        jobIndex,
                        segments
                    );
                }
            }
        }

        jobs.push({
            edgeOffset,
            edgeCount: segments.length - edgeOffset,
            slotX,
            slotY,
            slotWidth,
            slotHeight,
            tileWidth,
            tileHeight,
            gutter,
        });
        const { localBounds, strokePadding } = computePathDrawMetadata(
            path,
            contours,
            normalizationSpan
        );
        entryByPath.set(pathString, [
            (slotX + gutter + 0.5) / width,
            (slotY + gutter + 0.5) / height,
            (slotX + gutter + tileWidth - 0.5) / width,
            (slotY + gutter + tileHeight - 0.5) / height,
            ...localBounds,
            ...strokePadding,
        ]);
    }

    const entries = new Float32Array(paths.length * 12);
    for (let index = 0; index < paths.length; index++) {
        entries.set(entryByPath.get(paths[index]), index * 12);
    }

    return {
        width,
        height,
        tileSize,
        shapePixels,
        spread,
        gutter,
        slotSize,
        maxSlotWidth: Math.max(...jobs.map((job) => job.slotWidth)),
        maxSlotHeight: Math.max(...jobs.map((job) => job.slotHeight)),
        columns,
        pathCount: paths.length,
        uniquePathCount: uniquePaths.length,
        entries,
        segments,
        jobs,
        segmentData: packSegments(segments),
        jobData: packJobs(jobs),
    };
}
