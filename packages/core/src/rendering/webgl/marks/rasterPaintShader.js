import { getRasterCellRange } from "../../../data/rasterTile.js";
import { testCategorySelection } from "../../../selection/categorySelection.js";
import { isSelectionPredicateActive } from "../../../selection/selectionPredicateTree.js";
import clamp from "../../../utils/clamp.js";
import { cssColorToRgba } from "../../color.js";
import { emitSelectionPredicateGlsl } from "../gl/glslScaleGenerator.js";
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
 * @typedef {NonNullable<ReturnType<import("../../../marks/raster.js").default["getCellPaintPlan"]>>["color"]} Branches
 */

/**
 * WebGL raster cells use the usual conditional branches with their own
 * projection bindings. Bind spatial intervals as cell index ranges in the
 * existing per-tile draw so brush changes keep the cell textures resident.
 * @param {import("../../../marks/raster.js").default} mark
 * @param {import("../gl/webGLHelper.js").default} glHelper
 * @param {"float" | "uint"} valueType
 * @param {() => PaletteIndexer | undefined} readPaletteIndexer
 */
export function createRasterPaintShader(
    mark,
    glHelper,
    valueType,
    readPaletteIndexer
) {
    const plan = mark.getCellPaintPlan();
    if (!plan) return;
    const { color, opacity, params, readBand } = plan;
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
    /** @type {string[]} */
    const declarations = [];

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

    // An uninitialized selection differs from an initialized empty selection.
    const state = new Map(
        Array.from(params, (param) => [
            param,
            bind("int", () => {
                const selection = selections.get(param);
                if (!selection) return 0;
                return isSelectionPredicateActive(selection) ? 2 : 1;
            }),
        ])
    );
    const active = (/** @type {string} */ param) =>
        `(${state.get(param)} == 2)`;

    /**
     * @param {string} param
     * @param {Membership["type"]} type
     * @param {Projection} projection
     */
    function bindProjection(param, type, { component, input }) {
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
                                readBand(datum),
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
            const uniform = bind("vec2", () => readBounds() ?? [0, 0]);
            return `(${uniform}.x <= value && value < ${uniform}.y)`;
        }

        const axis = input[0] === "x" ? "x" : "y";
        const uniform = bind(
            "ivec2",
            (_datum, tile) => {
                const bounds = readBounds();
                if (!bounds) return [0, 0];
                const dimension =
                    axis === "x" ? tile.horizontal : tile.vertical;
                return getRasterCellRange(dimension, bounds);
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
        return `(${active(param)} ? (${expressions.join(" && ")}) : ${empty})`;
    };

    /**
     * @param {string} name
     * @param {"float" | "vec4"} type
     * @param {Branches} branches
     * @param {(value: import("../../../spec/channel.js").Scalar) => Uniform} encode
     * @param {string} [fallback]
     */
    function emitPaint(name, type, branches, encode, fallback) {
        if (!branches.length) return "";
        const statements = branches.map(({ tree, params, accessor }) => {
            const result = `return ${bind(type, () => encode(accessor(null)))};`;
            if (!tree) return result;
            const test = [
                ...params.map((param) => `${state.get(param)} > 0`),
                emitSelectionPredicateGlsl(tree, emitLeaf, active),
            ].join(" && ");
            return `if (${test}) ${result}`;
        });
        if (fallback) statements.push(`return ${fallback};`);
        return `${type} ${name}(ivec2 cell, ${valueType} value) {
${statements.join("\n")}
}`;
    }

    const opacityField = mark.getCellBinding().channel === "opacity";
    const colorShader = emitPaint(
        "rasterColor",
        "vec4",
        color,
        (value) =>
            value == null ? [0, 0, 0, 0] : cssColorToRgba(String(value)),
        opacityField ? undefined : "cellColor(value)"
    );
    const opacityShader = emitPaint(
        "rasterOpacity",
        "float",
        opacity,
        (value) => clamp(Number(value)),
        opacityField ? "cellOpacity(value)" : undefined
    );
    /** @type {Uniforms} */
    const uniforms = {};
    return {
        hasColor: !!colorShader,
        hasOpacity: !!opacityShader,
        source: `
${declarations.join("\n")}
${deleteCategoryTextures.length ? SELECTION_HASH : ""}
${colorShader}
${opacityShader}
`,
        prepare() {
            for (const param of params)
                selections.set(
                    param,
                    mark.unitView.paramRuntime.findValue(param)
                );
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
