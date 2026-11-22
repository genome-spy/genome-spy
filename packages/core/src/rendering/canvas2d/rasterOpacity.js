import { range } from "d3-array";
import { findRasterEdge } from "../../data/rasterTile.js";
import {
    compileSelectionPredicateTree,
    isSelectionPredicateActive,
} from "../../selection/selectionPredicateTree.js";
import { shallowArrayEquals } from "../../utils/arrayUtils.js";
import clamp from "../../utils/clamp.js";
import { getCachedOrCall } from "../../utils/propertyCacher.js";

/** @typedef {import("../../marks/raster.js").default} RasterMark */
/** @typedef {import("../../data/flowNode.js").Datum} Datum */
/** @typedef {ReturnType<import("../../data/rasterTile.js").readRasterTile>} Tile */
/** @typedef {(datum: Datum, tile: Tile, paint: (start: number, end: number, alpha: number) => void) => void} PaintOpacitySpans */

/** @param {RasterMark} mark */
export function getCanvasOpacitySpans(mark) {
    const plan = mark.getOpacityPlan();
    if (plan) {
        return getCachedOrCall(mark, "canvasOpacitySpans", () =>
            createOpacitySpans(mark, plan)
        )();
    }
}

/**
 * Reuse the cell tests until the selection or branch opacity changes.
 * @param {RasterMark} mark
 * @param {NonNullable<ReturnType<RasterMark["getOpacityPlan"]>>} plan
 * @returns {() => PaintOpacitySpans}
 */
function createOpacitySpans(
    mark,
    { conditions, memberships, params, readRow }
) {
    const { type, direct } = mark.getColorCellBinding();
    const numericColor = type === "quantitative" && !direct;
    /** @type {unknown[]} */
    let previous = [];
    /** @type {PaintOpacitySpans} */
    let paintSpans;
    return () => {
        const values = new Map(
            Array.from(params, (name) => [
                name,
                mark.unitView.paramRuntime.findValue(name),
            ])
        );
        const opacity = conditions.map(({ opacity }) =>
            Math.fround(clamp(opacity(null)))
        );
        const signature = [...values.values(), ...opacity];
        if (shallowArrayEquals(signature, previous)) return paintSpans;
        previous = signature;

        const lookup = (/** @type {string} */ name) => values.get(name);
        const predicates = conditions.map(({ tree, params }) =>
            !tree || !params.every(lookup)
                ? () => !tree
                : compileSelectionPredicateTree(tree, lookup)
        );
        /** @type {{ x: number[], y: number[] }} */
        const thresholds = { x: [], y: [] };
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
                    thresholds[input[0] === "x" ? "x" : "y"].push(
                        ...interval.intervals[component]
                    );
            }
        }
        paintSpans = (datum, { horizontal: x, vertical: y, values }, paint) => {
            const cell = {
                x: 0,
                x2: 0,
                y: readRow ? readRow(datum) : 0,
                y2: 0,
                color: /** @type {string | number | null} */ (null),
            };
            const height = y?.count ?? 1;
            const rows = gridCuts(
                height,
                readRow ? undefined : y,
                varyingColor ? undefined : thresholds.y
            );
            const columns = gridCuts(
                x.count,
                x,
                varyingColor ? undefined : thresholds.x
            );
            const alpha = () => {
                for (let branch = 0; branch < predicates.length; branch++) {
                    if (predicates[branch](cell)) return opacity[branch];
                }
            };
            const projectX = thresholds.x.length > 0;
            const projectY = !readRow && y && thresholds.y.length > 0;
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
                    const value = alpha();
                    if (!(value > 0)) continue;
                    for (let next = row; next < rows[i]; next++) {
                        const offset = next * x.count;
                        paint(offset + column, offset + columns[j], value);
                    }
                }
            }
        };
        return paintSpans;
    };
}

/**
 * Cell tests can change next to a brush boundary. Both bisectors account
 * for strict and inclusive comparisons, including repeated edge values.
 * @param {number} count
 * @param {import("../../data/rasterTile.js").RasterDimension | undefined} dimension
 * @param {number[] | undefined} thresholds Omit when the predicate reads cell values.
 */
function gridCuts(count, dimension, thresholds) {
    if (!thresholds) return range(count + 1);
    if (!dimension || !thresholds.length) return [0, count];
    const cuts = new Set([0, count]);
    for (const threshold of thresholds) {
        for (const strict of [false, true]) {
            const i = findRasterEdge(dimension, threshold, strict);
            cuts.add(Math.min(count, i));
            cuts.add(Math.max(0, i - 1));
        }
    }
    return [...cuts].sort((a, b) => a - b);
}
