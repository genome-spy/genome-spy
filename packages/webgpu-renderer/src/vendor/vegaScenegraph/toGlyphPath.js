/**
 * Based on Vega Scenegraph's SVG path renderer.
 * https://github.com/vega/vega/blob/79aa7d9de7b09604c5f881a09fd528d2b561d12f/packages/vega-scenegraph/src/path/render.js
 */

import { arcSegments, arcSegmentToCubic } from "./arc.js";
import { parseSvgPath } from "./parse.js";

/**
 * @typedef {import("../../symbols/pathTypes.js").GlyphPath} GlyphPath
 * @typedef {GlyphPath["commands"][number]} GlyphPathCommand
 */

/**
 * Convert an SVG path string to the renderer's focused path representation.
 * Bounds conservatively include Bézier control points.
 *
 * @param {string} path
 * @returns {GlyphPath}
 */
export function svgPathToGlyphPath(path) {
    const parsed = parseSvgPath(path);
    /** @type {GlyphPathCommand[]} */
    const commands = [];
    let x = 0;
    let y = 0;
    let anchorX = 0;
    let anchorY = 0;
    let cubicControlX = 0;
    let cubicControlY = 0;
    let quadraticControlX = 0;
    let quadraticControlY = 0;
    let previousType = "";
    let xMin = Infinity;
    let yMin = Infinity;
    let xMax = -Infinity;
    let yMax = -Infinity;

    /** @param {...number} coordinates */
    const include = (...coordinates) => {
        for (let i = 0; i < coordinates.length; i += 2) {
            xMin = Math.min(xMin, coordinates[i]);
            yMin = Math.min(yMin, coordinates[i + 1]);
            xMax = Math.max(xMax, coordinates[i]);
            yMax = Math.max(yMax, coordinates[i + 1]);
        }
    };

    for (const current of parsed) {
        const type = current[0];
        const relative = type === type.toLowerCase();
        const upper = type.toUpperCase();
        /** @param {number} value */
        const absoluteX = (value) => (relative ? x + value : value);
        /** @param {number} value */
        const absoluteY = (value) => (relative ? y + value : value);

        if (upper === "M") {
            x = absoluteX(current[1]);
            y = absoluteY(current[2]);
            anchorX = x;
            anchorY = y;
            commands.push({ type: "M", x, y });
            include(x, y);
        } else if (upper === "L") {
            x = absoluteX(current[1]);
            y = absoluteY(current[2]);
            commands.push({ type: "L", x, y });
            include(x, y);
        } else if (upper === "H") {
            x = absoluteX(current[1]);
            commands.push({ type: "L", x, y });
            include(x, y);
        } else if (upper === "V") {
            y = absoluteY(current[1]);
            commands.push({ type: "L", x, y });
            include(x, y);
        } else if (upper === "C") {
            const x1 = absoluteX(current[1]);
            const y1 = absoluteY(current[2]);
            const x2 = absoluteX(current[3]);
            const y2 = absoluteY(current[4]);
            x = absoluteX(current[5]);
            y = absoluteY(current[6]);
            commands.push({ type: "C", x1, y1, x2, y2, x, y });
            include(x1, y1, x2, y2, x, y);
            cubicControlX = x2;
            cubicControlY = y2;
        } else if (upper === "S") {
            const smooth = previousType === "C" || previousType === "S";
            const x1 = smooth ? 2 * x - cubicControlX : x;
            const y1 = smooth ? 2 * y - cubicControlY : y;
            const x2 = absoluteX(current[1]);
            const y2 = absoluteY(current[2]);
            x = absoluteX(current[3]);
            y = absoluteY(current[4]);
            commands.push({ type: "C", x1, y1, x2, y2, x, y });
            include(x1, y1, x2, y2, x, y);
            cubicControlX = x2;
            cubicControlY = y2;
        } else if (upper === "Q") {
            const x1 = absoluteX(current[1]);
            const y1 = absoluteY(current[2]);
            x = absoluteX(current[3]);
            y = absoluteY(current[4]);
            commands.push({ type: "Q", x1, y1, x, y });
            include(x1, y1, x, y);
            quadraticControlX = x1;
            quadraticControlY = y1;
        } else if (upper === "T") {
            const smooth = previousType === "Q" || previousType === "T";
            const x1 = smooth ? 2 * x - quadraticControlX : x;
            const y1 = smooth ? 2 * y - quadraticControlY : y;
            x = absoluteX(current[1]);
            y = absoluteY(current[2]);
            commands.push({ type: "Q", x1, y1, x, y });
            include(x1, y1, x, y);
            quadraticControlX = x1;
            quadraticControlY = y1;
        } else if (upper === "A") {
            const endX = absoluteX(current[6]);
            const endY = absoluteY(current[7]);
            const radiusX = current[1];
            const radiusY = current[2];
            if (radiusX === 0 || radiusY === 0) {
                commands.push({ type: "L", x: endX, y: endY });
                include(endX, endY);
            } else {
                const segments = arcSegments(
                    endX,
                    endY,
                    radiusX,
                    radiusY,
                    current[4],
                    current[5],
                    current[3],
                    x,
                    y
                );
                for (const segment of segments) {
                    const [x1, y1, x2, y2, segmentX, segmentY] =
                        arcSegmentToCubic(segment);
                    commands.push({
                        type: "C",
                        x1,
                        y1,
                        x2,
                        y2,
                        x: segmentX,
                        y: segmentY,
                    });
                    include(x1, y1, x2, y2, segmentX, segmentY);
                    cubicControlX = x2;
                    cubicControlY = y2;
                }
            }
            x = endX;
            y = endY;
        } else if (upper === "Z") {
            commands.push({ type: "Z" });
            x = anchorX;
            y = anchorY;
        } else {
            throw new Error(`Unsupported SVG path command: ${type}`);
        }

        if (upper !== "C" && upper !== "S" && upper !== "A") {
            cubicControlX = x;
            cubicControlY = y;
        }
        if (upper !== "Q" && upper !== "T") {
            quadraticControlX = x;
            quadraticControlY = y;
        }
        previousType = upper;
    }

    return {
        commands,
        bounds: xMin === Infinity ? null : { xMin, yMin, xMax, yMax },
    };
}
