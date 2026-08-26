import PointProgram from "./programs/pointProgram.js";

/**
 * Immutable point-mark behavior. Mutable GPU resources are created per renderer
 * by `createProgram` and are never stored on this definition.
 *
 * @type {import("../index.d.ts").MarkDefinition<import("../index.d.ts").MarkConfig<"point">>}
 */
export const pointMark = Object.freeze({
    type: "point",
    createProgram(renderer, config, context) {
        return new PointProgram(/** @type {any} */ (renderer), config, context);
    },
});
