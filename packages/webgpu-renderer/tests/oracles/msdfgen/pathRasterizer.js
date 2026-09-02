import { renderMsdfWasm } from "./runtime/msdfgenWasm.js";

/**
 * @typedef {import("../../../src/symbols/pathTypes.js").GlyphPath} GlyphPath
 */

const EDGE_LINE = 1;
const EDGE_QUADRATIC = 2;
const EDGE_CUBIC = 3;

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
function samePoint(a, b) {
    return Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) <= 1e-9;
}

/**
 * @param {GlyphPath} path
 * @returns {{ contourOffsets: Uint32Array, edgeKinds: Uint32Array, edgeCoordinates: Float64Array }}
 */
export function encodePathEdges(path) {
    /** @type {number[]} */
    const contourOffsets = [0];
    /** @type {number[]} */
    const edgeKinds = [];
    /** @type {number[]} */
    const edgeCoordinates = [];
    /** @type {{ x: number, y: number } | null} */
    let currentPoint = null;
    /** @type {{ x: number, y: number } | null} */
    let firstPoint = null;
    let contourOpen = false;

    /**
     * @param {number} kind
     * @param {{ x: number, y: number }[]} points
     */
    const addEdge = (kind, points) => {
        edgeKinds.push(kind);
        const finalPoint = points[points.length - 1];
        while (points.length < 4) {
            points.push(finalPoint);
        }
        for (const point of points) {
            edgeCoordinates.push(point.x, point.y);
        }
        currentPoint = finalPoint;
    };

    /** @param {{ x: number, y: number }} endpoint */
    const snapLastEndpoint = (endpoint) => {
        const kind = edgeKinds.at(-1);
        const pointIndex =
            kind === EDGE_LINE ? 1 : kind === EDGE_QUADRATIC ? 2 : 3;
        const offset = (edgeKinds.length - 1) * 8 + pointIndex * 2;
        edgeCoordinates[offset] = endpoint.x;
        edgeCoordinates[offset + 1] = endpoint.y;
    };

    for (const command of path.commands) {
        if (command.type === "M") {
            if (contourOpen) {
                throw new Error("PathPoint paths must close every contour.");
            }
            currentPoint = { x: command.x, y: command.y };
            firstPoint = currentPoint;
            contourOpen = true;
        } else if (command.type === "L") {
            if (!currentPoint) {
                throw new Error("PathPoint edge command requires a move.");
            }
            const end = { x: command.x, y: command.y };
            if (!samePoint(currentPoint, end)) {
                addEdge(EDGE_LINE, [currentPoint, end]);
            }
            currentPoint = end;
        } else if (command.type === "Q") {
            if (!currentPoint) {
                throw new Error("PathPoint edge command requires a move.");
            }
            addEdge(EDGE_QUADRATIC, [
                currentPoint,
                { x: command.x1, y: command.y1 },
                { x: command.x, y: command.y },
            ]);
        } else if (command.type === "C") {
            if (!currentPoint) {
                throw new Error("PathPoint edge command requires a move.");
            }
            addEdge(EDGE_CUBIC, [
                currentPoint,
                { x: command.x1, y: command.y1 },
                { x: command.x2, y: command.y2 },
                { x: command.x, y: command.y },
            ]);
        } else if (command.type === "Z") {
            if (!contourOpen || !currentPoint || !firstPoint) {
                throw new Error("PathPoint close command requires a contour.");
            }
            if (!samePoint(currentPoint, firstPoint)) {
                addEdge(EDGE_LINE, [currentPoint, firstPoint]);
            } else if (edgeKinds.length > contourOffsets.at(-1)) {
                // msdfgen requires bit-identical shared endpoints. Arc-to-cubic
                // conversion commonly leaves the closing endpoint a few ulps
                // away from the move point.
                snapLastEndpoint(firstPoint);
            }
            if (contourOffsets.at(-1) === edgeKinds.length) {
                throw new Error(
                    "PathPoint contours must contain visible edges."
                );
            }
            contourOffsets.push(edgeKinds.length);
            currentPoint = null;
            firstPoint = null;
            contourOpen = false;
        }
    }

    if (contourOpen) {
        throw new Error("PathPoint paths must close every contour.");
    }
    if (edgeKinds.length === 0) {
        throw new Error("PathPoint paths must contain visible edges.");
    }
    return {
        contourOffsets: new Uint32Array(contourOffsets),
        edgeKinds: new Uint32Array(edgeKinds),
        edgeCoordinates: new Float64Array(edgeCoordinates),
    };
}

/**
 * @param {GlyphPath} path
 * @param {{ width: number, height: number, scale: number, offsetX?: number, offsetY?: number, spread?: number }} options
 * @returns {{ buffer: Uint8Array, width: number, rows: number, pitch: number }}
 */
export function renderPathMsdf(path, options) {
    const {
        width,
        height,
        scale,
        offsetX = 0,
        offsetY = 0,
        spread = 8,
    } = options;
    const encoded = encodePathEdges(path);
    const buffer = renderMsdfWasm(
        encoded.contourOffsets,
        encoded.edgeKinds,
        encoded.edgeCoordinates,
        {
            width,
            height,
            scaleX: scale,
            scaleY: scale,
            offsetX,
            offsetY,
            pixelRange: spread,
        }
    );
    return { buffer, width, rows: height, pitch: width * 3 };
}
