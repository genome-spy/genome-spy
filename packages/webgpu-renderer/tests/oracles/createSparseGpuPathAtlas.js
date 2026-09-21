import { MsdfAtlasGenerator } from "../../src/symbols/sparseGpuPathAtlas.js";

/** Create one standalone atlas for focused GPU tests. */
export function createSparseGpuPathAtlas(device, paths, options = {}) {
    const generator = new MsdfAtlasGenerator(device);
    const atlas = generator.createAtlas(paths, options);
    atlas.completion.then(
        () => generator.destroy(),
        () => generator.destroy()
    );
    return atlas;
}
