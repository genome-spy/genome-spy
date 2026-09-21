import PointProgram from "./programs/pointProgram.js";
import PathPointProgram from "./programs/pathPointProgram.js";
import { resolvePointShape } from "../symbols/pointShapes.js";

/** @param {import("../index.d.ts").PointMarkConfig} config */
function resolvePathConfig(config) {
    const shape = config.shape;
    const shapes = config.shapes;
    if (shape !== undefined && shapes !== undefined) {
        throw new Error("Point config cannot define both shape and shapes.");
    }
    if (shape === undefined && shapes === undefined) {
        return null;
    }
    if (shape === "circle") {
        return null;
    }
    const table = shapes ?? [shape];
    const paths = table.map(resolvePointShape);
    return {
        ...config,
        paths,
        atlasOptions: { normalizationSpan: 2 },
        channels: {
            ...config.channels,
            ...(shape === undefined ? {} : { shape: { value: 0 } }),
        },
    };
}

/**
 * Immutable point-mark behavior. Mutable GPU resources are created per renderer
 * by `createProgram` and are never stored on this definition.
 *
 * @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").PointMarkConfig>}
 */
export const pointMark = Object.freeze({
    type: "point",
    getProgramKey(config) {
        if (config.shape !== undefined) {
            return `shape:${config.shape}`;
        }
        if (config.shapes !== undefined) {
            return `shapes:${JSON.stringify(config.shapes)}`;
        }
        return "legacy";
    },
    createProgram(renderer, config, context) {
        const pathConfig = resolvePathConfig(config);
        const Program = pathConfig ? PathPointProgram : PointProgram;
        return new Program(
            /** @type {any} */ (renderer),
            pathConfig ?? config,
            context
        );
    },
});
