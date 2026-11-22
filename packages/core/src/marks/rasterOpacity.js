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
    if (!branches || branches.length === 1) return;

    /** @type {Extract<import("../selection/selectionPredicateTree.js").ResolvedSelectionPredicate, {param: string}>[]} */
    const memberships = [];
    const conditions = branches.map(({ accessor, predicate }) => {
        if (!accessor.constant || !isValueDef(accessor.channelDef)) {
            throw new ViewError(
                "Raster opacity branches require value encodings.",
                mark.unitView
            );
        }
        const tree = predicate.selection;
        for (const leaf of tree ? selectionPredicateLeaves(tree) : []) {
            if (!("type" in leaf)) continue;
            if (leaf.type === "single" || leaf.type === "multi") {
                throw new ViewError(
                    "Point selection membership requires individual raster cell identities.",
                    mark.unitView
                );
            }
            memberships.push(leaf);
        }
        return {
            tree,
            params: tree ? getSelectionPredicateTreeParams(tree) : [],
            opacity: accessor.asNumberAccessor(),
        };
    });
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
        const state = Array.from(names, (name) =>
            mark.unitView.paramRuntime.findValue(name)
        );
        const opacity = conditions.map(({ opacity }) => clamp(opacity(null)));
        const signature = [
            mark.unitView.getCollector()?.dataRevision,
            ...state,
            ...opacity,
        ];
        if (shallowArrayEquals(signature, previous)) return read;
        previous = signature;

        const values = new Map(
            Array.from(names, (name, i) => [name, state[i]])
        );
        const lookup = (/** @type {string} */ name) => values.get(name);
        const predicates = conditions.map(({ tree, params }) => {
            if (!tree) return () => true;
            return params.every(lookup)
                ? compileSelectionPredicateTree(tree, lookup)
                : () => false;
        });
        const varyingColor = memberships.some((leaf) => {
            if (leaf.type === "categories")
                return leaf.projections[0].input === "color";
            const selection = lookup(leaf.param);
            return (
                leaf.type === "interval" &&
                selection?.type === "interval" &&
                Object.values(selection.intervals).every(Boolean) &&
                leaf.projections.some(({ input }) => input === "color")
            );
        });
        const projections = varyingColor
            ? []
            : memberships.flatMap((leaf) => {
                  if (leaf.type !== "interval" || !lookup(leaf.param))
                      return [];
                  return leaf.projections
                      .filter(({ input }) =>
                          ["x", "x2", "y", "y2"].includes(input)
                      )
                      .map((projection) => ({
                          axis: projection.input[0],
                          test: compileSelectionPredicateTree(
                              { ...leaf, projections: [projection] },
                              lookup
                          ),
                      }));
              });
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
            const setRow = (/** @type {number} */ row) => {
                if (y && !readY) {
                    cell.y = y.origin + row * y.step;
                    cell.y2 = y.origin + (row + 1) * y.step;
                }
            };
            const setColumn = (/** @type {number} */ column) => {
                if (!readX) {
                    cell.x = x.origin + column * x.step;
                    cell.x2 = x.origin + (column + 1) * x.step;
                }
            };
            const alpha = () => {
                for (let branch = 0; branch < predicates.length; branch++) {
                    if (predicates[branch](cell)) return opacity[branch];
                }
            };
            const height = y?.count ?? 1;
            if (varyingColor) {
                for (let row = 0, i = 0; row < height; row++) {
                    setRow(row);
                    for (let column = 0; column < x.count; column++, i++) {
                        setColumn(column);
                        cell.color = numericColor
                            ? Math.fround(
                                  /** @type {number} */ (values[i] ?? NaN)
                              )
                            : values[i];
                        mask[i] = alpha();
                    }
                }
            } else {
                // Between projection boundaries every cell takes the same branch.
                const cuts = (
                    /** @type {string} */ axis,
                    /** @type {number} */ count,
                    /** @type {(i: number) => void} */ set
                ) => {
                    const edges = new Set([0, count]);
                    for (const { axis: projected, test } of projections) {
                        if (projected !== axis) continue;
                        set(0);
                        let previous = test(cell);
                        for (let i = 1; i < count; i++) {
                            set(i);
                            const matches = test(cell);
                            if (matches !== previous) edges.add(i);
                            previous = matches;
                        }
                    }
                    return Array.from(edges).sort((a, b) => a - b);
                };
                const rows = cuts("y", height, setRow);
                const columns = cuts("x", x.count, setColumn);
                for (let i = 0; i < rows.length - 1; i++) {
                    setRow(rows[i]);
                    for (let j = 0; j < columns.length - 1; j++) {
                        setColumn(columns[j]);
                        const value = alpha();
                        if (!value) continue;
                        for (let row = rows[i]; row < rows[i + 1]; row++) {
                            const offset = row * x.count;
                            mask.fill(
                                value,
                                offset + columns[j],
                                offset + columns[j + 1]
                            );
                        }
                    }
                }
            }
            masks.set(datum, mask);
            return mask;
        };
        return read;
    };
}
