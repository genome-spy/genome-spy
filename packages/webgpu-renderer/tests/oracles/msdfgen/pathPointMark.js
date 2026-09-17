import PathPointProgram from "../../../src/marks/programs/pathPointProgram.js";
import QuantizedGpuPathPointProgram from "./quantizedGpuPathPointProgram.js";
import WasmPathPointProgram from "./wasmPathPointProgram.js";

/**
 * Test-only comparison mark. Production point marks always use the shared
 * WGSL generator through `pointMark`.
 *
 * @type {import("../../../src/index.d.ts").MarkDefinition<any>}
 */
export const comparisonPathPointMark = Object.freeze({
    type: "comparisonPathPoint",
    createProgram(renderer, config, context) {
        let Program = PathPointProgram;
        if (config.atlasBackend === "wasm") {
            Program = WasmPathPointProgram;
        } else if (config.atlasBackend === "gpu-rgba8") {
            Program = QuantizedGpuPathPointProgram;
        }
        return new Program(/** @type {any} */ (renderer), config, context);
    },
});
