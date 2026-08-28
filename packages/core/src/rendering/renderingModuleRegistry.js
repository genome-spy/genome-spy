/**
 * @typedef {(options: import("./renderingBackend.js").RenderingBackendOptions) => Promise<import("./renderingBackend.js").RenderingBackend>} RenderingBackendFactory
 * @typedef {() => Promise<typeof import("./svg/index.js")>} SvgRendererLoader
 * @typedef {object} RenderingModules
 * @prop {RenderingBackendFactory} [canvasBackend]
 * @prop {RenderingBackendFactory} [webglBackend]
 * @prop {() => Promise<{exportRaster: typeof import("./canvas2d/rasterExport.js").exportRaster}>} [canvasRasterExport]
 * @prop {() => Promise<{createCanvas2DSvgRasterizer: typeof import("./canvas2d/svgRasterizer.js").createCanvas2DSvgRasterizer}>} [canvasSvgRasterizer]
 * @prop {SvgRendererLoader} [svgRenderer]
 */

/** @type {RenderingModules} */
export const renderingModules = {};
