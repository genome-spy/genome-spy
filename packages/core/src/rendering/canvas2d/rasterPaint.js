import { range } from "d3-array";
import { getRasterCellRange } from "../../data/rasterTile.js";
import {
    compileSelectionPredicateTree,
    isSelectionPredicateActive,
} from "../../selection/selectionPredicateTree.js";
import { shallowArrayEquals } from "../../utils/arrayUtils.js";
import clamp from "../../utils/clamp.js";
import { getCachedOrCall } from "../../utils/propertyCacher.js";
import { packCssColor } from "../color.js";

/** @typedef {import("../../marks/raster.js").default} RasterMark */
/** @typedef {import("../../data/flowNode.js").Datum} Datum */
/** @typedef {ReturnType<import("../../data/rasterTile.js").readRasterTile>} Tile */
/** @typedef {(datum: Datum, tile: Tile, paint: (start: number, end: number, alpha?: number, color?: number) => void) => void} PaintSpans */
/** @typedef {NonNullable<ReturnType<RasterMark["getCellPaintPlan"]>>} PaintPlan */

/** @param {RasterMark} mark */
export function getCanvasRasterPaintSpans(mark) {
    const plan = mark.getCellPaintPlan();
    if (plan) {
        return getCachedOrCall(mark, "canvasRasterPaintSpans", () =>
            createPaintSpans(mark, plan)
        )();
    }
}

/**
 * Reuse the cell tests until the selection or branch paint changes.
 * @param {RasterMark} mark
 * @param {PaintPlan} plan
 * @returns {() => PaintSpans}
 */
function createPaintSpans(
    mark,
    { color, opacity, memberships, params, bandAxis, readBand }
) {
    const { type, direct } = mark.getCellBinding();
    const numericColor = type === "quantitative" && !direct;
    /** @type {unknown[]} */
    let previous = [];
    /** @type {PaintSpans} */
    let paintSpans;
    return () => {
        const values = new Map(
            Array.from(params, (name) => [
                name,
                mark.unitView.paramRuntime.findValue(name),
            ])
        );
        const colors = color.map(({ accessor }) =>
            packCssColor(accessor(null))
        );
        const alphas = opacity.map(({ accessor }) =>
            Math.fround(clamp(Number(accessor(null))))
        );
        const signature = [...values.values(), ...colors, ...alphas];
        if (shallowArrayEquals(signature, previous)) return paintSpans;
        previous = signature;

        const lookup = (/** @type {string} */ name) => values.get(name);
        /** @param {PaintPlan["color"][number]} branch */
        const compile = ({ tree, params }) =>
            !tree || !params.every(lookup)
                ? () => !tree
                : compileSelectionPredicateTree(tree, lookup);
        const colorTests = color.map(compile);
        const opacityTests = opacity.map(compile);
        /** @type {{ x: number[][], y: number[][] }} */
        const intervals = { x: [], y: [] };
        let varyingColor = false;
        for (const { param, projections, type } of memberships) {
            const selection = lookup(param);
            const interval = selection?.type === "interval" && selection;
            if (
                type === "interval" &&
                !(interval && isSelectionPredicateActive(interval))
            )
                continue;

            for (const { component, input } of projections) {
                if (input === "color") varyingColor = true;
                else if (interval)
                    intervals[input[0] === "x" ? "x" : "y"].push(
                        interval.intervals[component]
                    );
            }
        }
        paintSpans = (datum, { horizontal: x, vertical: y, values }, paint) => {
            /** @type {import("../../data/flowNode.js").Datum} */
            const cell = {
                x: 0,
                x2: 0,
                y: 0,
                y2: 0,
                color: null,
            };
            if (bandAxis) cell[bandAxis] = readBand(datum);
            const rows = gridCuts(y, varyingColor ? undefined : intervals.y);
            const columns = gridCuts(x, varyingColor ? undefined : intervals.x);
            /** @param {typeof colorTests} predicates */
            const matchingBranch = (predicates) => {
                for (let branch = 0; branch < predicates.length; branch++) {
                    if (predicates[branch](cell)) return branch;
                }
                return -1;
            };
            const projectX = intervals.x.length > 0;
            const projectY = intervals.y.length > 0;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i - 1];
                const start = row * x.count;
                if (projectY) {
                    cell.y = y.origin + row * y.step;
                    cell.y2 = y.origin + (row + 1) * y.step;
                }
                for (let j = 1; j < columns.length; j++) {
                    const column = columns[j - 1];
                    const index = start + column;
                    if (projectX) {
                        cell.x = x.origin + column * x.step;
                        cell.x2 = x.origin + (column + 1) * x.step;
                    }
                    if (varyingColor) {
                        cell.color = numericColor
                            ? Math.fround(
                                  /** @type {number} */ (values[index] ?? NaN)
                              )
                            : values[index];
                    }
                    const value = alphas[matchingBranch(opacityTests)];
                    if (value !== undefined && !(value > 0)) continue;
                    const fill = colors[matchingBranch(colorTests)];
                    if (columns.length === 2) {
                        paint(index, rows[i] * x.count, value, fill);
                        continue;
                    }
                    for (let next = row; next < rows[i]; next++) {
                        const offset = next * x.count;
                        paint(
                            offset + column,
                            offset + columns[j],
                            value,
                            fill
                        );
                    }
                }
            }
        };
        return paintSpans;
    };
}

/**
 * Partition the grid wherever a brush can change the paint.
 * @param {import("../../data/rasterTile.js").RasterDimension} dimension
 * @param {number[][] | undefined} intervals Omit when the predicate reads cell values.
 */
function gridCuts(dimension, intervals) {
    const { count } = dimension;
    if (!intervals) return range(count + 1);
    if (!intervals.length) return [0, count];
    const cuts = new Set([0, count]);
    for (const bounds of intervals) {
        const [start, end] = getRasterCellRange(dimension, bounds);
        cuts.add(start).add(end);
    }
    return [...cuts].sort((a, b) => a - b);
}
