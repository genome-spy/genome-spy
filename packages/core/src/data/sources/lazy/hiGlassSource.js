import { registerBuiltInLazyDataSourceLoader } from "./lazyDataSourceRegistry.js";

registerBuiltInLazyDataSourceLoader(
    "higlass",
    () => import("./hiGlassTileSource.js")
);
