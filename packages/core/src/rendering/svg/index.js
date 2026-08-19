import Rectangle from "../../view/layout/rectangle.js";
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

    viewRoot.render(
        renderingContext,
        Rectangle.create(0, 0, logicalWidth, logicalHeight),
        { firstFacet: true }
    );

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
    viewRoot.render(
        renderingContext,
        Rectangle.create(0, 0, logicalWidth, logicalHeight),
        { firstFacet: true }
    );
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
 * @param {import("../../gl/webGLHelper.js").default} [options.webGLHelper]
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
    if (!options.webGLHelper) {
        const result = createSvg(options);
        return {
            ...result,
            warnings: [
                ...result.warnings,
                "SVG rasterization was requested but no WebGL context is available; exported all marks as vectors.",
            ],
            rasterized: [],
        };
    }

    return createRasterizedSvg({
        ...options,
        webGLHelper: options.webGLHelper,
        maxVectorInstances: rasterization.maxVectorInstances,
        pixelRatio: rasterization.pixelRatio,
    });
}

/**
 * Creates a hybrid SVG using the existing WebGL context for marks whose exact
 * post-culling instance count exceeds the supplied threshold.
 *
 * @param {object} options
 * @param {import("../../view/view.js").default} options.viewRoot
 * @param {import("../../gl/webGLHelper.js").default} options.webGLHelper
 * @param {number} options.logicalWidth
 * @param {number} options.logicalHeight
 * @param {string | null} [options.background]
 * @param {number} options.maxVectorInstances
 * @param {number} [options.pixelRatio]
 */
export async function createRasterizedSvg({
    viewRoot,
    webGLHelper,
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

    renderingContext.beginInstanceCounting();
    viewRoot.render(renderingContext, coords, { firstFacet: true });
    renderingContext.endInstanceCounting();

    viewRoot.render(renderingContext, coords, { firstFacet: true });
    const runs = renderingContext.getRasterRuns();
    if (runs.length) {
        const { rasterizeSvgRuns } = await import("./raster/webgl.js");
        rasterizeSvgRuns({
            runs,
            viewRoot,
            webGLHelper,
            logicalWidth,
            logicalHeight,
            pixelRatio,
        });
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
