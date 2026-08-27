import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import { RasterizationUnavailableError } from "../rasterization.js";
import SvgViewRenderingContext from "./svgViewRenderingContext.js";

/**
 * Creates an SVG document by traversing a prepared view hierarchy.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @returns {{svg: SVGSVGElement, warnings: string[]}}
 */
export function createSvg({
    viewRoot,
    logicalWidth,
    logicalHeight,
    background = "white",
}) {
    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background,
        }
    );

    const layoutResult = createLayoutResult(
        viewRoot,
        Rectangle.create(0, 0, logicalWidth, logicalHeight),
        { renderingOptions: { firstFacet: true } }
    );
    layoutResult.collectRenderCommands(renderingContext);

    return {
        svg: renderingContext.getSvg(),
        warnings: renderingContext.getWarnings(),
    };
}

/**
 * Counts the visible instances of every SVG-exportable mark without emitting
 * instance elements or requiring WebGL.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @returns {import("../../types/embedApi.js").SvgExportAnalysis}
 */
export function analyzeSvgExport({ viewRoot, logicalWidth, logicalHeight }) {
    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background: null,
        }
    );

    renderingContext.beginInstanceCounting();
    const layoutResult = createLayoutResult(
        viewRoot,
        Rectangle.create(0, 0, logicalWidth, logicalHeight),
        { renderingOptions: { firstFacet: true } }
    );
    layoutResult.collectRenderCommands(renderingContext);
    renderingContext.endInstanceCounting();

    return {
        layers: Array.from(
            renderingContext.getVisibleInstanceCounts(),
            ([mark, instanceCount]) => ({
                viewName: mark.unitView.name,
                viewTitle: mark.unitView.getTitleText(),
                viewPath: mark.unitView.getPathString(),
                markType: mark.getType(),
                instanceCount,
            })
        ).filter((layer) => layer.instanceCount > 0),
    };
}

/**
 * Creates either a vector-only or hybrid SVG without requiring WebGL for the
 * vector path.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {(options: import("../renderingBackend.js").SvgRunRasterizationOptions) => void | Promise<void>} [options.rasterizeSvgRuns]
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @param {{maxVectorInstances: number, pixelRatio?: number}} [options.rasterization]
 */
export async function createSvgExport(options) {
    const rasterization = options.rasterization;
    if (!rasterization) {
        return { ...createSvg(options), rasterized: [] };
    }

    validateRasterizationOptions(rasterization);
    if (!options.rasterizeSvgRuns) {
        return createVectorRasterizationFallback(options);
    }

    return createRasterizedSvg({
        ...options,
        rasterizeSvgRuns: options.rasterizeSvgRuns,
        maxVectorInstances: rasterization.maxVectorInstances,
        pixelRatio: rasterization.pixelRatio,
    });
}

/**
 * Creates a hybrid SVG for marks whose exact post-culling instance count
 * exceeds the supplied threshold.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {(options: import("../renderingBackend.js").SvgRunRasterizationOptions) => void | Promise<void>} options.rasterizeSvgRuns
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @param {number} options.maxVectorInstances
 * @param {number} [options.pixelRatio]
 */
export async function createRasterizedSvg({
    viewRoot,
    rasterizeSvgRuns,
    logicalWidth,
    logicalHeight,
    background = "white",
    maxVectorInstances,
    pixelRatio = 2,
}) {
    validateRasterizationOptions({ maxVectorInstances, pixelRatio });

    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background,
            maxVectorInstances,
        }
    );
    const coords = Rectangle.create(0, 0, logicalWidth, logicalHeight);
    const layoutResult = createLayoutResult(viewRoot, coords, {
        renderingOptions: { firstFacet: true },
    });

    renderingContext.beginInstanceCounting();
    layoutResult.collectRenderCommands(renderingContext);
    renderingContext.endInstanceCounting();

    layoutResult.collectRenderCommands(renderingContext);
    const runs = renderingContext.getRasterRuns();
    if (runs.length) {
        try {
            await rasterizeSvgRuns({
                runs,
                viewRoot,
                layoutResult,
                logicalWidth,
                logicalHeight,
                pixelRatio,
            });
        } catch (error) {
            if (error instanceof RasterizationUnavailableError) {
                return createVectorRasterizationFallback({
                    viewRoot,
                    logicalWidth,
                    logicalHeight,
                    background,
                });
            }
            throw error;
        }
    }

    return {
        svg: renderingContext.getSvg(),
        warnings: renderingContext.getWarnings(),
        rasterized: runs.map((run) => ({
            targets: run.targets.map((target) => ({
                markType: target.mark.getType(),
                instanceCount: target.instanceCount,
            })),
            reason: /** @type {const} */ ("instance-threshold"),
            maxVectorInstances,
            pixelRatio,
        })),
    };
}

/**
 * @param {Parameters<typeof createSvg>[0]} options
 */
function createVectorRasterizationFallback(options) {
    const result = createSvg(options);
    return {
        ...result,
        warnings: [
            ...result.warnings,
            "SVG rasterization was requested but no raster rendering backend is available; exported all marks as vectors.",
        ],
        rasterized:
            /** @type {import("../../types/embedApi.js").SvgRasterizationInfo[]} */
            ([]),
    };
}

/**
 * @param {{maxVectorInstances: number, pixelRatio?: number}} options
 */
function validateRasterizationOptions(options) {
    if (
        !Number.isInteger(options.maxVectorInstances) ||
        options.maxVectorInstances < 0
    ) {
        throw new RangeError(
            "maxVectorInstances must be a non-negative integer."
        );
    }
    if (
        options.pixelRatio != null &&
        (!Number.isFinite(options.pixelRatio) || options.pixelRatio <= 0)
    ) {
        throw new RangeError("SVG raster pixelRatio must be positive.");
    }
}
