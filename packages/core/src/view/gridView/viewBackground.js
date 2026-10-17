/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackground(viewBackground) {
    const fillOpacity =
        viewBackground?.fillOpacity ?? (viewBackground?.fill ? 1.0 : 0.0);
    const shadowOpacity = viewBackground?.shadowOpacity ?? 0.0;
    const required =
        (viewBackground?.fill && fillOpacity !== 0) || shadowOpacity !== 0;
    if (!required) {
        return;
    }

    return {
        data: { values: [{}] },
        mark: {
            color: viewBackground.fill,
            opacity: fillOpacity,
            type: "rect",
            clip: false, // Shouldn't be needed
            tooltip: null,
            minHeight: 1,
            minOpacity: 0,
            shadowBlur: viewBackground.shadowBlur,
            shadowColor: viewBackground.shadowColor,
            shadowOffsetX: viewBackground.shadowOffsetX,
            shadowOffsetY: viewBackground.shadowOffsetY,
            shadowOpacity: viewBackground.shadowOpacity,
        },
    };
}

/**
 * @param {import("../../spec/view.js").ViewBackground} viewBackground
 * @returns {import("../../spec/view.js").UnitSpec}
 */
export function createBackgroundStroke(viewBackground) {
    if (
        !viewBackground ||
        !viewBackground.stroke ||
        viewBackground.strokeWidth === 0 ||
        viewBackground.strokeOpacity === 0
    ) {
        return;
    }

    // Using rules to draw a non-filled rectangle.
    // We are not using a rect mark because it is not optimized for outlines.
    // TODO: Implement "hollow" mesh for non-filled rectangles
    return {
        resolve: {
            scale: { x: "excluded", y: "excluded" },
        },
        data: {
            values: [
                { x: 0, y: 0, x2: 1, y2: 0 },
                { x: 1, y: 0, x2: 1, y2: 1 },
                { x: 1, y: 1, x2: 0, y2: 1 },
                { x: 0, y: 1, x2: 0, y2: 0 },
            ],
        },
        mark: {
            size: viewBackground.strokeWidth ?? 1.0,
            color: viewBackground.stroke ?? "lightgray",
            strokeCap: "square",
            opacity: viewBackground.strokeOpacity ?? 1.0,
            type: "rule",
            clip: "never",
            tooltip: null,
        },
        encoding: {
            x: { field: "x", type: "quantitative", scale: null },
            y: { field: "y", type: "quantitative", scale: null },
            x2: { field: "x2" },
            y2: { field: "y2" },
        },
    };
}
