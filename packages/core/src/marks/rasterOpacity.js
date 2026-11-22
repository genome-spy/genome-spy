import { bisectLeft, bisectRight, range } from "d3-array";
import { isValueDef } from "../encoder/encoder.js";
import {
    compileSelectionPredicateTree,
    getSelectionPredicateTreeParams,
    selectionPredicateLeaves,
} from "../selection/selectionPredicateTree.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";
import clamp from "../utils/clamp.js";
import ViewError from "../view/viewError.js";

/** @typedef {import("../data/flowNode.js").Datum} Datum */
/** @typedef {ReturnType<import("../data/rasterTile.js").readRasterTile>} Tile */
/** @typedef {(datum: Datum, tile?: Tile) => Float32Array} ReadCellOpacity */

/**
 * Compile the normal selection predicates against a cell rather than the tile
 * row. Canvas and WebGL can share the masks between drawing and picking.
 * @param {import("./raster.js").default} mark
 * @returns {(() => ReadCellOpacity) | undefined}
 */
export function createRasterCellOpacity(mark) {
    const branches = mark.encoders.opacity?.branches;
    if (!branches) return;
    if (branches.some(({ accessor }) => !isValueDef(accessor.channelDef))) {
        throw new ViewError(
            "Raster opacity requires value encodings.",
            mark.unitView
        );
    }
    if (branches.length === 1) return;

    const conditions = branches.map(
        ({ accessor, predicate: { selection } }) => ({
            tree: selection,
            params: selection ? getSelectionPredicateTreeParams(selection) : [],
            opacity: accessor.asNumberAccessor(),
        })
    );
    const memberships = conditions
        .values()
        .filter(({ tree }) => tree)
        .flatMap(({ tree }) => selectionPredicateLeaves(tree))
        .filter((leaf) => "type" in leaf)
        .toArray();
    if (memberships.some(({ type }) => type === "single" || type === "multi")) {
        throw new ViewError(
            "Point selection membership requires individual raster cell identities.",
            mark.unitView
        );
    }
    const names = new Set(conditions.flatMap(({ params }) => params));

    const { readTile, strip, type, direct } = mark.getColorCellBinding();
    const numericColor = type === "quantitative" && !direct;
    const readX = mark.isIcon && mark.encoders.x.branches[0].accessor;
    const readY =
        (mark.isIcon || strip) && mark.encoders.y?.branches[0].accessor;
    /** @type {unknown[]} */
    let previous = [];
    /** @type {ReadCellOpacity} */
    let read;
    return () => {
        const values = new Map(
            Array.from(names, (name) => [
                name,
                mark.unitView.paramRuntime.findValue(name),
            ])
        );
        const opacity = conditions.map(({ opacity }) => clamp(opacity(null)));
        const signature = [
            mark.unitView.getCollector()?.dataRevision,
            ...values.values(),
            ...opacity,
        ];
        if (shallowArrayEquals(signature, previous)) return read;
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
            if (
                type === "interval" &&
                !(
                    selection?.type === "interval" &&
                    Object.values(selection.intervals).every(Boolean)
                )
            )
                continue;

            for (const { component, input } of projections) {
                if (input === "color") varyingColor = true;
                else if (selection?.type === "interval")
                    thresholds[input[0] === "x" ? "x" : "y"].push(
                        ...selection.intervals[component]
                    );
            }
        }
        /** @type {WeakMap<object, Float32Array>} */
        const masks = new WeakMap();
        read = (
            datum,
            { horizontal: x, vertical: y, values } = readTile(datum)
        ) => {
            let mask = masks.get(datum);
            if (mask) return mask;
            mask = new Float32Array(values.length);
            const cell = {
                x: readX ? readX(datum) : 0,
                x2: 0,
                y: readY ? readY(datum) : 0,
                y2: 0,
                color: /** @type {string | number | null} */ (null),
            };
            const height = y?.count ?? 1;
            const rows = gridCuts(
                height,
                readY ? undefined : y,
                varyingColor ? undefined : thresholds.y
            );
            const columns = gridCuts(
                x.count,
                readX ? undefined : x,
                varyingColor ? undefined : thresholds.x
            );
            const alpha = () => {
                for (let branch = 0; branch < predicates.length; branch++) {
                    if (predicates[branch](cell)) return opacity[branch];
                }
            };
            const projectX = !readX && thresholds.x.length > 0;
            const projectY = !readY && y && thresholds.y.length > 0;
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
                    if (varyingColor) mask[index] = value;
                    else mask.fill(value, index, start + columns[j]);
                }
                for (let next = row + 1; next < rows[i]; next++) {
                    mask.copyWithin(next * x.count, start, start + x.count);
                }
            }
            masks.set(datum, mask);
            return mask;
        };
        return read;
    };
}

/**
 * Cell tests can change next to a brush boundary. Both bisectors account
 * for strict and inclusive comparisons, including repeated edge values.
 * @param {number} count
 * @param {import("../data/rasterTile.js").RasterDimension | undefined} dimension
 * @param {number[] | undefined} thresholds Omit when the predicate reads cell values.
 */
function gridCuts(count, dimension, thresholds) {
    if (!thresholds) return range(count + 1);
    if (!dimension || !thresholds.length) return [0, count];
    const { origin, step } = dimension;
    const edges = Float64Array.from(
        { length: count },
        (_, i) => origin + i * step
    );
    const cuts = new Set([0, count]);
    for (const threshold of thresholds) {
        for (const i of [
            bisectLeft(edges, threshold),
            bisectRight(edges, threshold),
        ]) {
            cuts.add(i);
            cuts.add(Math.max(0, i - 1));
        }
    }
    return [...cuts].sort((a, b) => a - b);
}
