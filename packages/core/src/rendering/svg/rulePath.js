import { formatSvgNumber as n } from "./svgNumber.js";

/**
 * Native ribbon contours for SVG's outside stroke and nominal-fill cutout.
 * Nonzero filling unions overlapping dash caps without tracing a polygon union.
 * @param {number} length
 * @param {number} size
 * @param {"butt" | "square" | "round"} cap
 * @param {number[] | null} dash
 * @param {number} offset
 */
export function rulePath(length, size, cap, dash, offset) {
    const radius = size / 2;
    let path = "";
    /** @param {number} a @param {number} b */
    const append = (a, b) => {
        if (a === b && cap === "butt") return;
        if (cap === "square") {
            a -= radius;
            b += radius;
        }
        path += `M${n(a)} ${n(-radius)}H${n(b)}`;
        if (cap === "round") {
            path += `A${n(radius)} ${n(radius)} 0 0 1 ${n(b)} ${n(radius)}H${n(a)}A${n(radius)} ${n(radius)} 0 0 1 ${n(a)} ${n(-radius)}Z`;
        } else {
            path += `V${n(radius)}H${n(a)}Z`;
        }
    };
    const count = dash?.length ?? 0;
    const period =
        (dash?.reduce((sum, value) => sum + value, 0) ?? 0) *
        (count % 2 ? 2 : 1);
    if (period === 0) {
        append(0, length);
    } else {
        let start = -(((offset % period) + period) % period);
        for (let index = 0; start <= length; index++) {
            const end = start + dash[index % count];
            if (index % 2 === 0 && end >= 0)
                append(Math.max(0, start), Math.min(length, end));
            start = end;
        }
    }
    return path;
}
