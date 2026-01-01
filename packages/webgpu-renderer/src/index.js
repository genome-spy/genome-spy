export { createRenderer } from "./renderer.js";
export { RendererError } from "./renderer.js";
export { setDebugResourcesEnabled } from "./marks/programs/baseProgram.js";
export {
    isChannelConfigWithScale,
    isChannelConfigWithoutScale,
    isSeriesChannelConfig,
    isValueChannelConfig,
} from "./types.js";
export {
    createDiscreteColorTexture,
    createDiscreteTexture,
    createInterpolatedColorTexture,
    createSchemeTexture,
    cssColorToArray,
} from "./utils/colorUtils.js";
export {
    createTextureFromData,
    prepareTextureData,
    writeTextureData,
} from "./utils/webgpuTextureUtils.js";
export {
    packHighPrecisionU32,
    packHighPrecisionU32Array,
    packHighPrecisionDomain,
    LOW_BITS,
    BASE,
} from "./utils/highPrecision.js";
export {
    buildHashTableMap,
    buildHashTableSet,
    HASH_EMPTY_KEY,
} from "./utils/hashTable.js";
