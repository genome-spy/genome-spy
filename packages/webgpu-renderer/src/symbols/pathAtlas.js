import { svgPathToGlyphPath } from "../vendor/vegaScenegraph/toGlyphPath.js";
import { renderPathMsdf } from "./pathRasterizer.js";
import { getPathDrawMetadata } from "./sparsePathAtlasLayout.js";

export const DEFAULT_PATH_ATLAS_OPTIONS = Object.freeze({
    tileSize: 256,
    spread: 32,
    shapePadding: 104,
    gutter: 1,
});

/**
 * @typedef {object} PathAtlas
 * @property {Uint8Array} data
 * @property {number} width
 * @property {number} height
 * @property {number} tileSize
 * @property {number} shapePixels
 * @property {number} spread
 * @property {number} gutter
 * @property {number} pathCount
 * @property {number} uniquePathCount
 * @property {Float32Array} entries Per-path UV, local draw bounds, and directional stroke padding.
 */

/**
 * Build a fixed RGBA MSDF atlas. Each tile has an extruded one-texel gutter,
 * and UV bounds address texel centers so linear filtering cannot sample an
 * adjacent tile.
 *
 * @param {string[]} paths
 * @param {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, normalizationSpan?: number }} [options]
 * @returns {PathAtlas}
 */
export function buildPathAtlas(paths, options = {}) {
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error("PathPoint requires a non-empty paths array.");
    }
    for (const path of paths) {
        if (typeof path !== "string" || path.trim() === "") {
            throw new Error("PathPoint paths must be non-empty SVG strings.");
        }
    }

    const tileSize = options.tileSize ?? DEFAULT_PATH_ATLAS_OPTIONS.tileSize;
    const spread = options.spread ?? DEFAULT_PATH_ATLAS_OPTIONS.spread;
    const shapePadding =
        options.shapePadding ?? DEFAULT_PATH_ATLAS_OPTIONS.shapePadding;
    const gutter = options.gutter ?? DEFAULT_PATH_ATLAS_OPTIONS.gutter;
    const normalizationSpan = options.normalizationSpan;
    const shapePixels = tileSize - shapePadding * 2;
    if (
        shapePixels <= 0 ||
        spread <= 0 ||
        spread > shapePadding ||
        gutter < 1 ||
        (normalizationSpan !== undefined && !(normalizationSpan > 0))
    ) {
        throw new Error("Invalid PathPoint atlas dimensions.");
    }

    const uniquePaths = Array.from(new Set(paths));
    const slotSize = tileSize + gutter * 2;
    const columns = Math.ceil(Math.sqrt(uniquePaths.length));
    const rows = Math.ceil(uniquePaths.length / columns);
    const width = columns * slotSize;
    const height = rows * slotSize;
    const data = new Uint8Array(width * height * 4);
    const entryByPath = new Map();

    for (let index = 0; index < uniquePaths.length; index++) {
        const pathString = uniquePaths[index];
        const path = svgPathToGlyphPath(pathString);
        if (!path.bounds) {
            throw new Error("PathPoint paths must contain visible commands.");
        }
        const pathWidth = path.bounds.xMax - path.bounds.xMin;
        const pathHeight = path.bounds.yMax - path.bounds.yMin;
        const maxSpan = Math.max(pathWidth, pathHeight);
        if (!(maxSpan > 0)) {
            throw new Error("PathPoint paths must have non-zero bounds.");
        }
        const scale = shapePixels / (normalizationSpan ?? maxSpan);
        const offsetX =
            shapePadding +
            (shapePixels - pathWidth * scale) * 0.5 -
            path.bounds.xMin * scale;
        const offsetY =
            shapePadding +
            (shapePixels - pathHeight * scale) * 0.5 -
            path.bounds.yMin * scale;
        const bitmap = renderPathMsdf(path, {
            width: tileSize,
            height: tileSize,
            scale,
            offsetX,
            offsetY,
            spread,
        });
        const column = index % columns;
        const row = Math.floor(index / columns);
        const slotX = column * slotSize;
        const slotY = row * slotSize;

        for (let targetY = 0; targetY < slotSize; targetY++) {
            const sourceY = Math.max(
                0,
                Math.min(tileSize - 1, targetY - gutter)
            );
            for (let targetX = 0; targetX < slotSize; targetX++) {
                const sourceX = Math.max(
                    0,
                    Math.min(tileSize - 1, targetX - gutter)
                );
                const source = sourceY * bitmap.pitch + sourceX * 3;
                const target =
                    ((slotY + targetY) * width + slotX + targetX) * 4;
                data[target] = bitmap.buffer[source];
                data[target + 1] = bitmap.buffer[source + 1];
                data[target + 2] = bitmap.buffer[source + 2];
                data[target + 3] = 255;
            }
        }

        const { localBounds, strokePadding } = getPathDrawMetadata(
            path,
            normalizationSpan
        );
        entryByPath.set(pathString, [
            (slotX + gutter + 0.5) / width,
            (slotY + gutter + 0.5) / height,
            (slotX + gutter + tileSize - 0.5) / width,
            (slotY + gutter + tileSize - 0.5) / height,
            ...localBounds,
            ...strokePadding,
        ]);
    }

    const entries = new Float32Array(paths.length * 12);
    for (let index = 0; index < paths.length; index++) {
        entries.set(entryByPath.get(paths[index]), index * 12);
    }

    return {
        data,
        width,
        height,
        tileSize,
        shapePixels,
        spread,
        gutter,
        pathCount: paths.length,
        uniquePathCount: uniquePaths.length,
        entries,
    };
}
