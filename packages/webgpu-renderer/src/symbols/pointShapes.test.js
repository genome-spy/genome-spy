import { describe, expect, test } from "vitest";

import { svgPathToGlyphPath } from "../vendor/vegaScenegraph/toGlyphPath.js";
import { BUILTIN_POINT_SHAPES, resolvePointShape } from "./pointShapes.js";
import { buildSparsePathAtlasLayout } from "./sparsePathAtlasLayout.js";

const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);

/** @typedef {{ x: number, y: number }} Point */

/**
 * Flatten a path solely for the compatibility raster below. Production path
 * preparation retains the original quadratic representation.
 *
 * @param {string} pathString
 * @returns {Point[][]}
 */
function flattenPath(pathString) {
    const path = svgPathToGlyphPath(pathString);
    /** @type {Point[][]} */
    const contours = [];
    /** @type {Point[] | null} */
    let contour = null;
    /** @type {Point | null} */
    let current = null;

    for (const command of path.commands) {
        if (command.type === "M") {
            contour = [{ x: command.x, y: command.y }];
            current = contour[0];
        } else if (command.type === "L") {
            current = { x: command.x, y: command.y };
            contour.push(current);
        } else if (command.type === "Q" || command.type === "C") {
            const start = current;
            for (let step = 1; step <= 32; step++) {
                const t = step / 32;
                const u = 1 - t;
                const point =
                    command.type === "Q"
                        ? {
                              x:
                                  u * u * start.x +
                                  2 * u * t * command.x1 +
                                  t * t * command.x,
                              y:
                                  u * u * start.y +
                                  2 * u * t * command.y1 +
                                  t * t * command.y,
                          }
                        : {
                              x:
                                  u * u * u * start.x +
                                  3 * u * u * t * command.x1 +
                                  3 * u * t * t * command.x2 +
                                  t * t * t * command.x,
                              y:
                                  u * u * u * start.y +
                                  3 * u * u * t * command.y1 +
                                  3 * u * t * t * command.y2 +
                                  t * t * t * command.y,
                          };
                contour.push(point);
            }
            current = contour.at(-1);
        } else if (command.type === "Z") {
            contours.push(contour);
            contour = null;
            current = null;
        }
    }

    return contours;
}

/** @param {Point[][]} contours @param {number} x @param {number} y */
function pathContains(contours, x, y) {
    let inside = false;
    for (const contour of contours) {
        for (
            let index = 0, previous = contour.length - 1;
            index < contour.length;
            previous = index++
        ) {
            const a = contour[index];
            const b = contour[previous];
            if (
                a.y > y !== b.y > y &&
                x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
            ) {
                inside = !inside;
            }
        }
    }
    return inside;
}

/** @param {number} x @param {number} y @param {number} radius @param {number} arm */
function analyticCross(x, y, radius, arm) {
    const qx = Math.abs(x);
    const qy = Math.abs(y);
    return (
        Math.min(
            Math.max(qx - arm, qy - radius),
            Math.max(qx - radius, qy - arm)
        ) <= 0
    );
}

/** @param {number} x @param {number} y */
function analyticTriangleUp(x, y) {
    const qy = -y - SQRT3 / 2;
    return Math.max((Math.abs(x) * SQRT3 + qy) / 2, -qy - SQRT3) <= 0;
}

/**
 * The predicates below are direct JavaScript translations of the retired
 * analytic point shader. X used stroke width as geometry, so its representative
 * width is chosen to match the canonical path's nominal extent.
 *
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 */
function analyticContains(shape, x, y) {
    if (shape === "circle") {
        return Math.hypot(x, y) <= 1;
    } else if (shape === "square") {
        return Math.max(Math.abs(x), Math.abs(y)) <= 1;
    } else if (shape === "cross") {
        return analyticCross(x, y, 1, 0.4);
    } else if (shape === "diamond") {
        return Math.abs(x) + Math.abs(y) <= 1;
    } else if (shape.startsWith("triangle-")) {
        if (shape === "triangle-up") {
            return analyticTriangleUp(x, y);
        } else if (shape === "triangle-right") {
            return analyticTriangleUp(y, -x);
        } else if (shape === "triangle-down") {
            return analyticTriangleUp(-x, -y);
        } else {
            return analyticTriangleUp(-y, x);
        }
    } else if (shape.startsWith("tick-")) {
        let tx = x;
        let ty = y;
        if (shape === "tick-right") {
            tx = y;
            ty = -x;
        } else if (shape === "tick-down") {
            tx = -x;
            ty = -y;
        } else if (shape === "tick-left") {
            tx = -y;
            ty = x;
        }
        return Math.abs(tx) <= 0.15 && ty >= -1 && ty <= 0;
    } else if (shape === "+") {
        return analyticCross(x, y, 1, 0.15);
    } else if (shape === "x") {
        const tx = (x - y) / SQRT2;
        const ty = (x + y) / SQRT2;
        return analyticCross(tx, ty, 1.2071, 0.2071);
    }
    throw new Error(`Missing analytic reference for ${shape}.`);
}

describe("point shapes", () => {
    test("every built-in resolves to a closed atlas path", () => {
        const paths = BUILTIN_POINT_SHAPES.map(resolvePointShape);

        expect(() =>
            buildSparsePathAtlasLayout(paths, { normalizationSpan: 2 })
        ).not.toThrow();
    });

    test("accepts SVG paths and rejects unknown names", () => {
        expect(resolvePointShape("M-1-1H1V1H-1Z")).toBe("M-1-1H1V1H-1Z");
        expect(() => resolvePointShape("squircle")).toThrow(
            "Unknown point shape: squircle"
        );
    });

    test.each(BUILTIN_POINT_SHAPES)(
        "%s approximately preserves the retired analytic silhouette",
        (shape) => {
            const contours = flattenPath(resolvePointShape(shape));
            let mismatches = 0;
            let analyticCoverage = 0;
            let pathCoverage = 0;
            const samplesPerAxis = 201;

            for (let row = 0; row < samplesPerAxis; row++) {
                const y = -1.15 + (2.3 * (row + 0.5)) / samplesPerAxis;
                for (let column = 0; column < samplesPerAxis; column++) {
                    const x = -1.15 + (2.3 * (column + 0.5)) / samplesPerAxis;
                    const analytic = analyticContains(shape, x, y);
                    const path = pathContains(contours, x, y);
                    analyticCoverage += Number(analytic);
                    pathCoverage += Number(path);
                    mismatches += Number(analytic !== path);
                }
            }

            expect(
                mismatches / (samplesPerAxis * samplesPerAxis),
                `${shape} silhouette mismatch`
            ).toBeLessThan(0.006);
            expect(
                Math.abs(pathCoverage / analyticCoverage - 1),
                `${shape} relative filled area`
            ).toBeLessThan(0.015);
        }
    );
});
