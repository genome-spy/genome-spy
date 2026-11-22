import { getRasterCellRange } from "../../../data/rasterTile.js";
import { testCategorySelection } from "../../../selection/categorySelection.js";
import { isSelectionPredicateActive } from "../../../selection/selectionPredicateTree.js";
import clamp from "../../../utils/clamp.js";
import {
    emitSelectionPredicateGlsl,
    ifElseGlsl,
} from "../gl/glslScaleGenerator.js";
import SELECTION_HASH from "../gl/includes/selectionHash.glsl";

/**
 * @typedef {import("../../../data/flowNode.js").Datum} Datum
 * @typedef {import("../../../types/selectionTypes.js").Selection} Selection
 * @typedef {Pick<ReturnType<import("../../../data/rasterTile.js").readRasterTile>, "horizontal" | "vertical">} TileGeometry
 * @typedef {number | boolean | number[] | Float32Array | WebGLTexture} Uniform
 * @typedef {Record<string, Uniform>} Uniforms
 * @typedef {import("../../../spec/parameter.js").IntervalSelectionChannel} IntervalChannel
 * @typedef {(value: import("../../../spec/channel.js").Scalar) => number} PaletteIndexer
 * @typedef {import("../../../selection/selectionPredicateTree.js").SelectionProjection} Projection
 * @typedef {Extract<import("../../../selection/selectionPredicateTree.js").ResolvedSelectionPredicate, {param: string}>} Membership
 */

/**
 * WebGL raster cells use the usual conditional branches with their own
 * projection bindings. Brush changes update uniforms and category sets.
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../gl/webGLHelper.js").default} glHelper
 * @param {"float" | "uint"} valueType
 * @param {() => PaletteIndexer | undefined} readPaletteIndexer
 */
export function createRasterOpacityShader(
    mark,
    glHelper,
    valueType,
    readPaletteIndexer
) {
    const plan = mark.getOpacityPlan();
    if (!plan) return;
    const { conditions, params, anchors } = plan;
    /** @type {Map<string, Selection | undefined>} */
    const selections = new Map();
    /** @type {Map<string, (datum?: Datum, tile?: TileGeometry) => Uniform>} */
    const frameBindings = new Map();
    /** @type {typeof frameBindings} */
    const tileBindings = new Map();
    /** @type {Map<string, string>} */
    const tests = new Map();
    /** @type {(() => void)[]} */
    const deleteCategoryTextures = [];
    const declarations = [
        `uniform vec2 uRasterOpacityBranches[${conditions.length}];`,
    ];

    /**
     * @param {string} type
     * @param {(datum?: Datum, tile?: TileGeometry) => Uniform} read
     * @param {boolean} [perTile]
     */
    function bind(type, read, perTile = false) {
        const name = "uRasterCondition" + declarations.length;
        declarations.push(`uniform ${type} ${name};`);
        (perTile ? tileBindings : frameBindings).set(name, read);
        return name;
    }

    const active = new Map(
        Array.from(params, (param) => [
            param,
            bind("bool", () => {
                const selection = selections.get(param);
                return !!selection && isSelectionPredicateActive(selection);
            }),
        ])
    );

    /**
     * @param {string} param
     * @param {Membership["type"]} type
     * @param {Projection} projection
     */
    function bindProjection(
        param,
        type,
        { component, input, secondaryInput, hitTest }
    ) {
        const axis = input[0] === "x" ? "x" : "y";
        const readAnchor = anchors[axis];
        if (type === "categories") {
            if (input !== "color") {
                return bind(
                    "bool",
                    (datum) => {
                        const selection = selections.get(param);
                        return (
                            selection?.type === "categories" &&
                            testCategorySelection(
                                selection,
                                readAnchor(datum),
                                false
                            )
                        );
                    },
                    true
                );
            }

            /** @type {WebGLTexture | undefined} */
            let texture;
            /** @type {Selection | undefined} */
            let previous;
            /** @type {PaletteIndexer | undefined} */
            let palette;
            deleteCategoryTextures.push(() =>
                glHelper.gl.deleteTexture(texture)
            );
            const uniform = bind("highp usampler2D", () => {
                const selection = selections.get(param);
                const indexer = readPaletteIndexer();
                if (texture && selection === previous && indexer === palette)
                    return texture;
                /** @type {Iterable<number>} */
                const values =
                    selection?.type === "categories"
                        ? selection.values.values().map(indexer)
                        : [];
                texture = glHelper.createIntegerSetTexture(values, texture);
                previous = selection;
                palette = indexer;
                return texture;
            });
            return `hashContainsTexture(${uniform}, value)`;
        }

        const interval = /** @type {IntervalChannel} */ (component);
        const readBounds = () => {
            const selection = selections.get(param);
            return selection?.type === "interval"
                ? selection.intervals[interval]
                : undefined;
        };
        if (input === "color") {
            const uniform = bind(
                "vec2",
                () => readBounds()?.map(ceilFloat32) ?? [0, 0]
            );
            return `(${uniform}.x <= value && value < ${uniform}.y)`;
        }

        const mode = secondaryInput
            ? (hitTest ?? "intersects")
            : input.endsWith("2")
              ? "end"
              : "start";
        const uniform = bind(
            "ivec2",
            (datum, tile) => {
                const bounds = readBounds();
                if (!bounds) return [0, 0];
                const dimension =
                    axis === "x" ? tile.horizontal : tile.vertical;
                if (!readAnchor)
                    return getRasterCellRange(dimension, bounds, mode);
                const value = Number(readAnchor(datum));
                return [
                    0,
                    bounds[0] <= value && value < bounds[1]
                        ? (dimension?.count ?? 1)
                        : 0,
                ];
            },
            true
        );
        return `(${uniform}.x <= cell.${axis} && cell.${axis} < ${uniform}.y)`;
    }

    /** @type {(leaf: Membership) => string} */
    const emitLeaf = ({ param, type, projections, empty }) => {
        const expressions = projections.map((projection) => {
            const key = JSON.stringify([param, projection]);
            if (!tests.has(key))
                tests.set(key, bindProjection(param, type, projection));
            return tests.get(key);
        });
        return `(${active.get(param)} ? (${expressions.join(" && ")}) : ${empty})`;
    };

    const shader = ifElseGlsl(
        conditions.map(({ tree }, i) =>
            tree
                ? `(uRasterOpacityBranches[${i}].y > 0.0 && ${emitSelectionPredicateGlsl(tree, emitLeaf, (param) => active.get(param))})`
                : null
        ),
        conditions.map((_, i) => `return uRasterOpacityBranches[${i}].x;`)
    );
    const values = new Float32Array(2 * conditions.length);
    /** @type {Uniforms} */
    const uniforms = { uRasterOpacityBranches: values };
    return {
        source: `
${declarations.join("\n")}
${deleteCategoryTextures.length ? SELECTION_HASH : ""}
float rasterOpacity(ivec2 cell, ${valueType} value) {
${shader}
}
`,
        prepare() {
            for (const param of params)
                selections.set(
                    param,
                    mark.unitView.paramRuntime.findValue(param)
                );
            for (const [i, { opacity, params }] of conditions.entries()) {
                values[2 * i] = clamp(opacity(null));
                values[2 * i + 1] = Number(
                    params.every((param) => selections.get(param))
                );
            }
            for (const [name, read] of frameBindings) uniforms[name] = read();
            return uniforms;
        },
        /** @param {Uniforms} uniforms @param {Datum} datum @param {TileGeometry} tile */
        setTileUniforms(uniforms, datum, tile) {
            for (const [name, read] of tileBindings)
                uniforms[name] = read(datum, tile);
        },
        dispose() {
            for (const dispose of deleteCategoryTextures) dispose();
        },
    };
}

const floatBits = new DataView(new ArrayBuffer(4));

/** Round up to preserve both inequalities of a half-open float interval. */
function ceilFloat32(/** @type {number} */ value) {
    const rounded = Math.fround(value);
    if (!(rounded < value)) return rounded;
    floatBits.setFloat32(0, rounded);
    floatBits.setUint32(0, floatBits.getUint32(0) + (rounded >= 0 ? 1 : -1));
    return floatBits.getFloat32(0);
}
