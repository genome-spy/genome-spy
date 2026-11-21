import RasterMark from "../../marks/raster.js";
import { createLayoutResult } from "../../view/layout/layoutResult.js";
import Rectangle from "../../view/layout/rectangle.js";
import { RasterizationUnavailableError } from "../rasterization.js";
import SvgViewRenderingContext from "./svgViewRenderingContext.js";
import { createNativeTextMetricsProvider } from "../nativeTextMetrics.js";
import { prepareTextMetrics } from "../nativeTextMetrics.js";

/**
 * Creates an SVG document by traversing a prepared view hierarchy.
 * This synchronous helper uses the active metrics unless supplied explicitly;
 * use createSvgExport when destination-native font loading is required.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @param {import("../../fonts/textMetrics.js").TextMetricsProvider} [options.textMetrics]
 * @returns {{svg: SVGSVGElement, warnings: string[]}}
 */
export function createSvg({
    viewRoot,
    logicalWidth,
    logicalHeight,
    background = "white",
    textMetrics = viewRoot.context.textMetrics,
}) {
    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background,
            textMetrics,
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
 * @returns {Promise<import("../../types/embedApi.js").SvgExportAnalysis>}
 */
export async function analyzeSvgExport({
    viewRoot,
    logicalWidth,
    logicalHeight,
}) {
    const textMetrics = await prepareSvgTextMetrics(viewRoot);
    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background: null,
            textMetrics,
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
                ...(mark instanceof RasterMark && {
                    requiresRasterization: /** @type {const} */ (true),
                }),
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
 * @param {import("../../types/embedApi.js").SvgRasterizationOptions} [options.rasterization]
 */
export async function createSvgExport(options) {
    return createRasterizedSvg({
        ...options,
        maxVectorInstances: options.rasterization?.maxVectorInstances,
        pixelRatio: options.rasterization?.pixelRatio,
    });
}

/**
 * Embeds raster marks and optionally converts dense vector layers to images.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {(options: import("../renderingBackend.js").SvgRunRasterizationOptions) => void | Promise<void>} [options.rasterizeSvgRuns]
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @param {number} [options.maxVectorInstances]
 * @param {number} [options.pixelRatio]
 * @param {import("../../fonts/textMetrics.js").TextMetricsProvider} [options.textMetrics]
 */
export async function createRasterizedSvg({
    viewRoot,
    rasterizeSvgRuns,
    logicalWidth,
    logicalHeight,
    background = "white",
    maxVectorInstances,
    pixelRatio = 2,
    textMetrics,
}) {
    textMetrics ??= await prepareSvgTextMetrics(viewRoot);
    validateRasterizationOptions({ maxVectorInstances, pixelRatio });

    const renderingContext = new SvgViewRenderingContext(
        { picking: false },
        {
            width: logicalWidth,
            height: logicalHeight,
            background,
            maxVectorInstances,
            embedRasterMarks: true,
            textMetrics,
        }
    );
    const coords = Rectangle.create(0, 0, logicalWidth, logicalHeight);
    const layoutResult = createLayoutResult(viewRoot, coords, {
        renderingOptions: { firstFacet: true },
    });

    if (maxVectorInstances != null) {
        renderingContext.beginInstanceCounting();
        layoutResult.collectRenderCommands(renderingContext);
        renderingContext.endInstanceCounting();
    }

    layoutResult.collectRenderCommands(renderingContext);
    const runs = renderingContext.getRasterRuns();
    const requiresRasterization = (
        /** @type {import("./svgViewRenderingContext.js").SvgRasterRun} */ run
    ) => run.marks.values().some((mark) => mark instanceof RasterMark);
    if (runs.length) {
        try {
            if (!rasterizeSvgRuns) {
                throw new RasterizationUnavailableError(
                    "No SVG rasterizer is available."
                );
            }
            await rasterizeSvgRuns({
                runs,
                viewRoot,
                layoutResult,
                textMetrics,
                logicalWidth,
                logicalHeight,
                pixelRatio,
            });
        } catch (error) {
            if (error instanceof RasterizationUnavailableError) {
                if (runs.some(requiresRasterization)) {
                    throw new RasterizationUnavailableError(
                        "SVG export requires a raster rendering backend for raster marks.",
                        { cause: error }
                    );
                }
                return createVectorRasterizationFallback({
                    viewRoot,
                    logicalWidth,
                    logicalHeight,
                    background,
                    textMetrics,
                });
            }
            throw error;
        }
    }

    return {
        svg: renderingContext.getSvg(),
        warnings: renderingContext.getWarnings(),
        rasterized: runs.map((run) => ({
            targets: Array.from(run.marks, (mark) => ({
                markType: mark.getType(),
                instanceCount: renderingContext.getVisibleInstanceCount(mark),
            })),
            reason: requiresRasterization(run)
                ? /** @type {const} */ ("raster-mark")
                : /** @type {const} */ ("instance-threshold"),
            ...(maxVectorInstances != null && { maxVectorInstances }),
            pixelRatio,
        })),
    };
}

/** @param {import("../../view/view.js").default} viewRoot */
async function prepareSvgTextMetrics(viewRoot) {
    if (!document.fonts) {
        return viewRoot.context.textMetrics;
    }
    const provider = createNativeTextMetricsProvider(document);
    await prepareTextMetrics(provider, viewRoot);
    return provider;
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
 * @param {import("../../types/embedApi.js").SvgRasterizationOptions} options
 */
function validateRasterizationOptions(options) {
    if (
        options.maxVectorInstances !== undefined &&
        (!Number.isInteger(options.maxVectorInstances) ||
            options.maxVectorInstances < 0)
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
