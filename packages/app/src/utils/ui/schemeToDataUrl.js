import { scheme } from "vega-scale";

// vega-scale doesn't export the names list, so we define it here
export const SCHEME_NAMES = [
    "blues",
    "greens",
    "greys",
    "oranges",
    "purples",
    "reds",
    "blueGreen",
    "bluePurple",
    "greenBlue",
    "orangeRed",
    "purpleBlue",
    "purpleBlueGreen",
    "purpleRed",
    "redPurple",
    "yellowGreen",
    "yellowOrangeBrown",
    "yellowOrangeRed",
    "blueOrange",
    "brownBlueGreen",
    "purpleGreen",
    "purpleOrange",
    "redBlue",
    "redGrey",
    "yellowGreenBlue",
    "redYellowBlue",
    "redYellowGreen",
    "pinkYellowGreen",
    "spectral",
    "viridis",
    "magma",
    "inferno",
    "plasma",
    "cividis",
    "rainbow",
    "sinebow",
    "turbo",
    "browns",
    "tealBlues",
    "teals",
    "warmGreys",
    "goldGreen",
    "goldOrange",
    "goldRed",
    "lightGreyRed",
    "lightGreyTeal",
    "lightMulti",
    "lightOrange",
    "lightTealBlue",
    "darkBlue",
    "darkGold",
    "darkGreen",
    "darkMulti",
    "darkRed",
    "accent",
    "category10",
    "category20",
    "category20b",
    "category20c",
    "dark2",
    "observable10",
    "paired",
    "pastel1",
    "pastel2",
    "set1",
    "set2",
    "set3",
    "tableau10",
    "tableau20",
];

/**
 *
 * @param {string} schemeName
 */
export function schemeToDataUrl(schemeName) {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 14;
    const ctx = /** @type {CanvasRenderingContext2D} */ (
        canvas.getContext("2d")
    );

    const s = scheme(schemeName);
    if (!s) {
        throw new Error(`Unknown scheme name: ${schemeName}`);
    }

    if (typeof s == "function") {
        const interpolator = s;

        const n = 20;
        const w = canvas.width / n;

        for (let i = 0; i < n; i++) {
            const c = interpolator(i / (n - 1));
            ctx.fillStyle = c;
            ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w), canvas.height);
        }
    } else if (Array.isArray(s)) {
        const colors = /** @type {string[]} */ (s);
        const n = colors.length;
        const w = canvas.width / n;

        for (let i = 0; i < n; i++) {
            const c = colors[i];
            ctx.fillStyle = c;
            ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w), canvas.height);
        }
    } else {
        throw new Error(`Unknown scheme format for scheme: ${schemeName}`);
    }

    return canvas.toDataURL();
}
