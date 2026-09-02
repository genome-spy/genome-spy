import PathPointProgram from "./programs/pathPointProgram.js";

/**
 * Temporary renderer-internal mark for the SVG-path MSDF proof of concept.
 *
 * @type {import("../index.d.ts").MarkDefinition<any>}
 */
export const pathPointMark = Object.freeze({
    type: "pathPoint",
    createProgram(renderer, config, context) {
        return new PathPointProgram(
            /** @type {any} */ (renderer),
            config,
            context
        );
    },
});
