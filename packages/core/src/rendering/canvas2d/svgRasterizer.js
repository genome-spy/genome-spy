import { RasterizationUnavailableError } from "../rasterization.js";
import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import { getPhysicalCrop, setRasterImage } from "../svg/raster/rasterImage.js";
import renderCanvas2D from "./renderCanvas2D.js";

/**
 * Initializes a detached Canvas2D selective rasterizer. Both contexts are
 * created before rendering so an unavailable Canvas2D implementation can fall
 * through without hiding later rendering errors.
 *
 * @returns {(options: import("../renderingBackend.js").SvgRunRasterizationOptions) => void}
 */
export function createCanvas2DSvgRasterizer() {
    let canvas;
    let context;
    let cropCanvas;
    let cropContext;
    try {
        canvas = document.createElement("canvas");
        context = canvas.getContext("2d");
        cropCanvas = document.createElement("canvas");
        cropContext = cropCanvas.getContext("2d");
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

    return (options) => {
        const width = Math.ceil(options.logicalWidth * options.pixelRatio);
        const height = Math.ceil(options.logicalHeight * options.pixelRatio);
        /** @type {CanvasRenderingContext2D[]} */
        const opacityLayers = [];
        canvas.width = width;
        canvas.height = height;

        const rasterLayoutResult =
            options.pixelRatio == 1 && options.layoutResult
                ? options.layoutResult
                : createLayoutResult(
                      options.viewRoot,
                      Rectangle.create(
                          0,
                          0,
                          options.logicalWidth,
                          options.logicalHeight
                      ),
                      {
                          devicePixelRatio: options.pixelRatio,
                          renderingOptions: { firstFacet: true },
                      }
                  );

        for (const run of options.runs) {
            renderCanvas2D({
                layoutResult: rasterLayoutResult,
                context,
                width: options.logicalWidth,
                height: options.logicalHeight,
                devicePixelRatio: options.pixelRatio,
                background: null,
                paint: true,
                markPredicate: (mark) => run.marks.has(mark),
                opacityLayers,
            });

            const crop = getPhysicalCrop(
                run.bounds,
                options.pixelRatio,
                width,
                height
            );
            cropCanvas.width = crop.width;
            cropCanvas.height = crop.height;
            cropContext.resetTransform();
            cropContext.clearRect(0, 0, crop.width, crop.height);
            cropContext.drawImage(
                canvas,
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                0,
                0,
                crop.width,
                crop.height
            );
            setRasterImage(
                run,
                crop,
                options.pixelRatio,
                cropCanvas.toDataURL("image/png")
            );
        }
    };
}
