import {
    getRasterExportLayout,
    RasterizationUnavailableError,
} from "../rasterization.js";
import { setRasterImageFromCanvas } from "../svg/raster/rasterImage.js";
import renderCanvas2D from "./renderCanvas2D.js";

/**
 * Initializes a detached Canvas2D selective rasterizer. Both contexts are
 * created before rendering so an unavailable Canvas2D implementation can fall
 * through without hiding later rendering errors.
 *
 * @returns {(options: import("../renderingBackend.js").SvgRunRasterizationOptions) => Promise<void>}
 */
export function createCanvas2DSvgRasterizer() {
    let canvas;
    let context;
    let cropContext;
    try {
        canvas = document.createElement("canvas");
        context = canvas.getContext("2d");
        cropContext = document.createElement("canvas").getContext("2d");
    } catch (error) {
        throw new RasterizationUnavailableError(
            "Unable to initialize Canvas2D SVG rasterization contexts.",
            { cause: error }
        );
    }
    if (!context || !cropContext) {
        throw new RasterizationUnavailableError(
            "Unable to initialize Canvas2D SVG rasterization contexts."
        );
    }

    return async (options) => {
        const width = Math.ceil(options.logicalWidth * options.pixelRatio);
        const height = Math.ceil(options.logicalHeight * options.pixelRatio);
        /** @type {CanvasRenderingContext2D[]} */
        const opacityLayers = [];
        canvas.width = width;
        canvas.height = height;

        const layoutResult = getRasterExportLayout(options);

        for (const run of options.runs) {
            renderCanvas2D({
                layoutResult,
                context,
                width: options.logicalWidth,
                height: options.logicalHeight,
                devicePixelRatio: options.pixelRatio,
                background: null,
                paint: true,
                applyViewOpacity: false,
                markPredicate: (mark) => run.marks.has(mark),
                opacityLayers,
                textMetrics: options.textMetrics,
            });

            setRasterImageFromCanvas(
                run,
                canvas,
                cropContext,
                options.pixelRatio
            );
        }
    };
}
