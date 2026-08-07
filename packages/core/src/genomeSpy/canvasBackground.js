import { getBuiltInThemeBackground } from "../config/themes.js";

/**
 * Resolves the canvas background configured by the root spec or its selected
 * built-in themes. Later themes override earlier themes when they define a
 * background.
 *
 * @param {import("../spec/root.js").RootSpec} spec
 * @returns {string | undefined}
 */
export function getCanvasBackground(spec) {
    if (spec.background !== undefined) {
        return spec.background;
    }

    const themes = spec.theme
        ? Array.isArray(spec.theme)
            ? spec.theme
            : [spec.theme]
        : [];
    let background;
    for (const themeName of themes) {
        const value = getBuiltInThemeBackground(themeName);
        if (value !== undefined) {
            background = value;
        }
    }
    return background;
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {{background?: string | null}} options
 * @returns {string | null}
 */
export function getExportBackground(spec, options) {
    return options.background !== undefined
        ? options.background
        : (getCanvasBackground(spec) ?? "white");
}
