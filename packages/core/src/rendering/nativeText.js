const NATIVE_FONT_FALLBACKS = [
    "Lato",
    "Avenir Next",
    "Avenir",
    "Segoe UI",
    "Ubuntu",
    "Noto Sans",
    "Helvetica Neue",
    "Helvetica",
    "Arial",
    "sans-serif",
];

const GENERIC_FONT_FAMILIES = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "emoji",
    "math",
    "fangsong",
]);

/** @param {string | undefined} font */
export function createNativeFontFamily(font) {
    const preferredFont = font ?? "Lato";
    return [
        preferredFont,
        ...NATIVE_FONT_FALLBACKS.filter(
            (fallback) => fallback.toLowerCase() != preferredFont.toLowerCase()
        ),
    ]
        .map(formatFontFamily)
        .join(", ");
}

/**
 * @param {"top" | "middle" | "bottom" | "alphabetic" | "baseline"} baseline
 * @param {number} fontSize
 */
export function getNativeBaselineOffset(baseline, fontSize) {
    switch (baseline) {
        case "top":
            return 0.79 * fontSize;
        case "middle":
            return 0.35 * fontSize;
        case "bottom":
            return -0.21 * fontSize;
        case "alphabetic":
        case "baseline":
            return 0;
        default:
            throw new Error(`Unknown text baseline: ${baseline}`);
    }
}

/** @param {string} family */
function formatFontFamily(family) {
    const normalizedFamily = family.toLowerCase();
    return GENERIC_FONT_FAMILIES.has(normalizedFamily)
        ? normalizedFamily
        : `'${family.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
