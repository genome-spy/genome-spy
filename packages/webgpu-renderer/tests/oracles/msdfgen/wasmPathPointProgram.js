import { buildPathAtlas } from "./pathAtlas.js";
import { createTextureFromData } from "../../../src/utils/webgpuTextureUtils.js";
import { gpuLabel } from "../../../src/utils/gpuLabel.js";
import PathPointProgram from "../../../src/marks/programs/pathPointProgram.js";

/** Canonical comparison backend used only by explicit prototype tooling. */
export default class WasmPathPointProgram extends PathPointProgram {
    /** @returns {void} */
    _initializeExtraResources() {
        const paths = this._markConfig.paths;
        if (!Array.isArray(paths)) {
            throw new Error("PathPoint config requires a paths array.");
        }
        if (
            this._markConfig.atlasFormat !== undefined &&
            this._markConfig.atlasFormat !== "rgba8unorm"
        ) {
            throw new Error(
                "The PathPoint WASM backend only supports rgba8unorm atlases."
            );
        }
        const atlas = buildPathAtlas(paths, this._markConfig.atlasOptions);
        const texture = createTextureFromData(
            this.device,
            {
                format: "rgba8unorm",
                width: atlas.width,
                height: atlas.height,
                data: atlas.data,
            },
            undefined,
            gpuLabel(this.label, "path atlas")
        );
        this._installPathAtlas(atlas, texture, "rgba8unorm");
    }
}
