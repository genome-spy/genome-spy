import { renderingModules } from "./renderingModuleRegistry.js";

renderingModules.canvasBackend = async (options) => {
    const { createCanvas2DRenderingBackend } =
        await import("./canvas2d/index.js");
    return createCanvas2DRenderingBackend(options);
};

renderingModules.canvasRasterExport = () =>
    import("./canvas2d/rasterExport.js");
renderingModules.canvasSvgRasterizer = () =>
    import("./canvas2d/svgRasterizer.js");
