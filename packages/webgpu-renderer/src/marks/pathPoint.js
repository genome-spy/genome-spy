import PathPointProgram from "./programs/pathPointProgram.js";
import WasmPathPointProgram from "./programs/wasmPathPointProgram.js";

/**
 * Temporary renderer-internal mark for the SVG-path MSDF proof of concept.
 *
 * @type {import("../index.d.ts").MarkDefinition<any>}
 */
export const pathPointMark = Object.freeze({
    type: "pathPoint",
    createProgram(renderer, config, context) {
        const Program =
            config.atlasBackend === "wasm"
                ? WasmPathPointProgram
                : PathPointProgram;
        return new Program(/** @type {any} */ (renderer), config, context);
    },
});
