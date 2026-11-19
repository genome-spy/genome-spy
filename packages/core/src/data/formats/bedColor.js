import { color } from "d3-color";

/**
 * @param {unknown} value BED column 9
 * @param {unknown} [fallback] CSS color for a missing value
 * @returns {string | null}
 */
export default function bedColor(value, fallback = null) {
    if (value == null) {
        if (fallback === null) {
            return null;
        }
        if (typeof fallback === "string" && color(fallback)) {
            return fallback;
        }
        throw new Error(
            `bedColor() expected a CSS fallback color, got ${JSON.stringify(fallback)}.`
        );
    }
    if (value === "0" || value === 0) {
        return "#000000";
    }

    const match =
        typeof value === "string" && /^(\d+),(\d+),(\d+)$/.exec(value);
    if (match) {
        const red = Number(match[1]);
        const green = Number(match[2]);
        const blue = Number(match[3]);
        if (red <= 255 && green <= 255 && blue <= 255) {
            const rgb = (red << 16) | (green << 8) | blue;
            return "#" + rgb.toString(16).padStart(6, "0");
        }
    }

    throw new Error(
        `bedColor() expected 0 or three comma-separated integers from 0 to 255, got ${JSON.stringify(value)}.`
    );
}
