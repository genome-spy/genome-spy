import { buildPathAtlas } from "./pathAtlas.js";
import { createTextureFromData } from "../../../src/utils/webgpuTextureUtils.js";
import { gpuLabel } from "../../../src/utils/gpuLabel.js";
import PathPointProgram, {
    PATH_POINT_SHADER_BODY,
} from "../../../src/marks/programs/pathPointProgram.js";

export const RGBA8_PATH_POINT_SHADER_BODY = PATH_POINT_SHADER_BODY.replace(
    "return median * devicePixelsPerAtlas;",
    `let atlasDistance = (median * 255.0 - 128.0) / 127.0 * params.uSpread;
    return atlasDistance * devicePixelsPerAtlas;`
);

/** Canonical comparison backend used only by explicit prototype tooling. */
export default class WasmPathPointProgram extends PathPointProgram {
    /** @returns {string} */
    get shaderBody() {
        return RGBA8_PATH_POINT_SHADER_BODY;
    }

    /** @returns {void} */
    _initializeExtraResources() {
        const paths = this._markConfig.paths;
        if (!Array.isArray(paths)) {
            throw new Error("PathPoint config requires a paths array.");
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
        this._installPathAtlas(atlas, texture, null, false, "rgba8unorm");
    }
}
