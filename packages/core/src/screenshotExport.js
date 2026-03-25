const MIN_VERTICAL_RESOLUTION = 400;

/**
 * @param {{ width: number | undefined, height: number | undefined }} renderedBounds
 * @param {{ width: number, height: number }} logicalSize
 */
export function resolveExportSize(renderedBounds, logicalSize) {
    return {
        width:
            Number.isFinite(renderedBounds.width) && renderedBounds.width > 0
                ? Math.ceil(renderedBounds.width)
                : Number.isFinite(logicalSize.width) && logicalSize.width > 0
                  ? logicalSize.width
                  : 500,
        height:
            Number.isFinite(renderedBounds.height) && renderedBounds.height > 0
                ? Math.ceil(renderedBounds.height)
                : Number.isFinite(logicalSize.height) && logicalSize.height > 0
                  ? logicalSize.height
                  : 280,
    };
}

/**
 * Returns the smallest DPR that yields at least 400 physical pixels vertically.
 *
 * Fractional DPRs are rounded upward to the nearest 0.5.
 *
 * @param {number} logicalHeight
 */
export function resolveCaptureDevicePixelRatio(logicalHeight) {
    if (!Number.isFinite(logicalHeight) || logicalHeight <= 0) {
        throw new Error(
            `Expected a positive logical height, got ${logicalHeight}.`
        );
    }

    if (logicalHeight >= MIN_VERTICAL_RESOLUTION) {
        return 1;
    }

    const requiredDevicePixelRatio = MIN_VERTICAL_RESOLUTION / logicalHeight;
    return Math.ceil(requiredDevicePixelRatio * 2) / 2;
}
