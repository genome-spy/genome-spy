import { loadDefaultFont } from "@genome-spy/webgpu-renderer/fonts/default";
import { loadTrueTypeFont } from "@genome-spy/webgpu-renderer/fonts/truetype";

const GOOGLE_FONTS_ROOT =
    "https://raw.githubusercontent.com/google/fonts/f6b2b7e8545e086ad3f821af21895d732b6485cf/ofl/";

const EXAMPLE_FONT_URLS = new Map(
    [
        [
            "Indie Flower",
            "normal",
            400,
            "indieflower/v24/m8JVjfNVeKWVnh3QMuKkFcZlbkGA1dM.ttf",
        ],
        ["Lato", "normal", 400, GOOGLE_FONTS_ROOT + "lato/Lato-Regular.ttf"],
        ["Lato", "italic", 400, GOOGLE_FONTS_ROOT + "lato/Lato-Italic.ttf"],
        ["Lato", "normal", 600, GOOGLE_FONTS_ROOT + "lato/Lato-SemiBold.ttf"],
        ["Lato", "normal", 700, GOOGLE_FONTS_ROOT + "lato/Lato-Bold.ttf"],
        ["Lato", "italic", 700, GOOGLE_FONTS_ROOT + "lato/Lato-BoldItalic.ttf"],
        ["Lato", "normal", 900, GOOGLE_FONTS_ROOT + "lato/Lato-Black.ttf"],
        ["Lobster", "normal", 400, "lobster/v32/neILzCirqoswsqX9_oWsNKEy.ttf"],
        [
            "Oswald",
            "normal",
            400,
            "oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1_FvgUFoYgaQ.ttf",
        ],
        [
            "Oswald",
            "normal",
            700,
            "oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1xZogUFoYgaQ.ttf",
        ],
        ["Radley", "normal", 400, "radley/v24/LYjDdGzinEIjCN19oAlCpVo.ttf"],
        [
            "Roboto Condensed",
            "normal",
            700,
            "robotocondensed/v31/ieVo2ZhZI2eCN5jzbjEETS9weq8-_d6T_POl0fRJeyVVpfBJ73tBKQ.ttf",
        ],
        [
            "Source Sans Pro",
            "normal",
            400,
            "sourcesanspro/v23/6xK3dSBYKcSV-LCoeQqfX1RYOo3aP6TimDc.ttf",
        ],
        [
            "Source Sans Pro",
            "normal",
            700,
            "sourcesanspro/v23/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vAkB1p_8E.ttf",
        ],
        [
            "Teko",
            "normal",
            400,
            "teko/v23/LYjYdG7kmE0gV69VVPPdFl06VN8XG7Sy3TSEvw.ttf",
        ],
    ].map(([family, style, weight, path]) => [
        fontKey(String(family), String(style), Number(weight)),
        String(path).startsWith("https://")
            ? String(path)
            : "https://fonts.gstatic.com/s/" + path,
    ])
);

/**
 * @param {string} family
 * @param {string} style
 * @param {number} weight
 */
function fontKey(family, style, weight) {
    return JSON.stringify([family, style, weight]);
}

/**
 * Validate and index an application catalog without loading any font data.
 *
 * @param {import("../../types/embedApi.js").FontCatalogEntry[]} entries
 * @returns {Map<string, string | URL>}
 */
function indexFontCatalog(entries) {
    const sources = new Map();
    for (const entry of entries) {
        if (typeof entry.family !== "string" || entry.family.trim() === "") {
            throw new Error("Font catalog families must be non-empty strings.");
        }
        const style = entry.style ?? "normal";
        if (style !== "normal" && style !== "italic") {
            throw new Error(
                `Unsupported font catalog style for ${entry.family}: ${style}.`
            );
        }
        const weight = entry.weight ?? 400;
        if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
            throw new Error(
                `Font catalog weight for ${entry.family} must be an integer from 1 to 1000.`
            );
        }
        if (!(
            entry.source instanceof URL ||
            (typeof entry.source === "string" && entry.source.trim() !== "")
        )) {
            throw new Error(
                `Font catalog source for ${entry.family} must be a non-empty URL.`
            );
        }
        const key = fontKey(entry.family, style, weight);
        if (sources.has(key)) {
            throw new Error(
                `Duplicate font catalog entry for ${entry.family} ${style} ${weight}.`
            );
        }
        sources.set(key, entry.source);
    }
    return sources;
}

/**
 * Resolve only the exact variants needed by repository examples. The compact
 * renderer-owned Default Font is reserved for implicit normal 400 requests;
 * other implicit variants use Lato without silently substituting weights.
 *
 * @param {{family: string | undefined, style: "normal" | "italic", weight: number, implicitFamily: boolean}} request
 * @returns {string | undefined}
 */
export function resolveExampleFontUrl(request) {
    if (
        request.implicitFamily &&
        request.style == "normal" &&
        request.weight == 400
    ) {
        return undefined;
    }
    const family = request.implicitFamily ? "Lato" : request.family;
    const url = EXAMPLE_FONT_URLS.get(
        fontKey(String(family), request.style, request.weight)
    );
    if (!url) {
        throw new Error(
            `No WebGPU TrueType font is available for ${family} ${request.style} ${request.weight}.`
        );
    }
    return url;
}

/**
 * Create a lazy outline loader that searches application entries before the
 * built-in example catalog. Constructing it performs no network requests.
 *
 * @param {import("../../types/embedApi.js").FontCatalogEntry[]} [entries]
 * @returns {(request: {family: string | undefined, style: "normal" | "italic", weight: number, implicitFamily: boolean}) => Promise<object>}
 */
export function createOutlineFontPreparer(entries = []) {
    const applicationSources = indexFontCatalog(entries);
    return (request) => {
        if (
            request.implicitFamily &&
            request.style === "normal" &&
            request.weight === 400
        ) {
            return loadDefaultFont();
        }
        const family = request.implicitFamily ? "Lato" : request.family;
        const key = fontKey(String(family), request.style, request.weight);
        const source =
            applicationSources.get(key) ?? resolveExampleFontUrl(request);
        return loadTrueTypeFont(source);
    };
}
