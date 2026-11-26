import { registerBuiltInLazyDataSourceLoader } from "./lazyDataSourceRegistry.js";

registerBuiltInLazyDataSourceLoader("hic", () => import("./hicTileSource.js"));
