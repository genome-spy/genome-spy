import ArrowProgram from "./programs/arrowProgram.js";

export const ARROW_DIRECTIONS = Object.freeze({
    forward: 0,
    reverse: 1,
    both: 2,
});

/**
 * @type {import("../index.d.ts").MarkDefinition<
 *   import("../index.d.ts").MarkConfig<"arrow">,
 *   Record<string, import("../index.d.ts").TypedArray>,
 *   import("../index.d.ts").ArrowMarkProperties
 * >}
 */
export const arrowMark = Object.freeze({
    type: "arrow",
    createProgram(renderer, config, context) {
        return new ArrowProgram(/** @type {any} */ (renderer), config, context);
    },
});
