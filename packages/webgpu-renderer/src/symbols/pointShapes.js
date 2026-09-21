export const BUILTIN_POINT_SHAPES = Object.freeze([
    "circle",
    "square",
    "cross",
    "diamond",
    "triangle-up",
    "triangle-right",
    "triangle-down",
    "triangle-left",
    "tick-up",
    "tick-right",
    "tick-down",
    "tick-left",
    "x",
    "+",
]);

const PATH_BY_SHAPE = new Map([
    ["circle", "M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z"],
    ["square", "M-1-1H1V1H-1Z"],
    ["cross", "M-.4-1H.4V-.4H1V.4H.4V1H-.4V.4H-1V-.4H-.4Z"],
    ["diamond", "M0-1L1 0 0 1-1 0Z"],
    ["triangle-up", "M0-.866025L1 .866025H-1Z"],
    ["triangle-right", "M.866025 0L-.866025 1V-1Z"],
    ["triangle-down", "M0 .866025L-1-.866025H1Z"],
    ["triangle-left", "M-.866025 0L.866025-1V1Z"],
    ["tick-up", "M-.15-1H.15V0H-.15Z"],
    ["tick-right", "M0-.15H1V.15H0Z"],
    ["tick-down", "M-.15 0H.15V1H-.15Z"],
    ["tick-left", "M-1-.15H0V.15H-1Z"],
    [
        "x",
        "M-.7071-1L0-.2929.7071-1 1-.7071.2929 0 1 .7071.7071 1 0 .2929-.7071 1-1 .7071-.2929 0-1-.7071Z",
    ],
    ["+", "M-.15-1H.15V-.15H1V.15H.15V1H-.15V.15H-1V-.15H-.15Z"],
]);

/**
 * Resolve a built-in name or accept an SVG path string.
 *
 * @param {string} shape
 */
export function resolvePointShape(shape) {
    const path = PATH_BY_SHAPE.get(shape);
    if (path) {
        return path;
    }
    if (/^\s*[Mm]/.test(shape)) {
        return shape;
    }
    throw new Error(`Unknown point shape: ${shape}`);
}
