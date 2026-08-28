import { formatSvgNumber } from "../svgNumber.js";

/**
 * @param {import("../../immediate/bounds.js").RenderBounds} bounds
 * @param {number} pixelRatio
 * @param {number} rasterWidth
 * @param {number} rasterHeight
 */
export function getPhysicalCrop(bounds, pixelRatio, rasterWidth, rasterHeight) {
    const x = Math.max(0, Math.floor(bounds.x1 * pixelRatio));
    const y = Math.max(0, Math.floor(bounds.y1 * pixelRatio));
    const x2 = Math.min(rasterWidth, Math.ceil(bounds.x2 * pixelRatio));
    const y2 = Math.min(rasterHeight, Math.ceil(bounds.y2 * pixelRatio));
    return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * @param {import("../svgViewRenderingContext.js").SvgRasterRun} run
 * @param {{x: number, y: number, width: number, height: number}} crop
 * @param {number} pixelRatio
 * @param {string} href
 */
export function setRasterImage(run, crop, pixelRatio, href) {
    const image = run.image;
    if (!image) {
        throw new Error("Raster run has no SVG image placeholder.");
    }
    image.setAttribute("x", "" + formatSvgNumber(crop.x / pixelRatio));
    image.setAttribute("y", "" + formatSvgNumber(crop.y / pixelRatio));
    image.setAttribute("width", "" + formatSvgNumber(crop.width / pixelRatio));
    image.setAttribute(
        "height",
        "" + formatSvgNumber(crop.height / pixelRatio)
    );
    image.setAttribute("href", href);
}
