import { createContigLookup } from "./genome/contigNames.js";
import { formatRange } from "./genome/locusFormat.js";

/**
 * Parses one-based inclusive text into zero-based half-open endpoints. Without
 * an assembly, only explicit positional syntax and same-contig order can be
 * validated; bare contig shortcuts require an assembly.
 *
 * @param {string} text
 * @param {import("./types/coordinates.js").CoordinateAssembly} [assembly]
 * @returns {import("./types/coordinates.js").CoordinateQueryResult}
 */
export function parseCoordinates(text, assembly) {
    const query = text.trim();
    const names = assembly ? createContigLookup(assembly.contigs) : undefined;
    const contig = names?.get(query);
    if (contig) {
        return coordinate(contig.name, 0, contig.name, contig.size);
    }
    if (!query.includes(":")) {
        return names && /^chr(?:\d+|[XYM]|MT)$/i.test(query)
            ? invalid("unknown-contig", "Unknown chromosome: " + query)
            : { kind: "not-coordinate" };
    }

    const candidates = names ? dictionaryCandidates(query, names) : [];
    if (candidates.length > 1)
        return invalid(
            "ambiguous-contig",
            "Ambiguous contig delimiters in: " + query
        );
    const candidate = candidates[0] ?? syntaxCandidate(query);
    if (!candidate)
        return invalid("syntax", "Invalid coordinate syntax: " + query);
    if (names && !candidates.length)
        return invalid("unknown-contig", "Unknown contig in: " + query);

    const [startName, startText, endName, endText] = candidate;
    const numberPattern = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
    const start = Number(startText.replaceAll(",", ""));
    const end = Number(endText.replaceAll(",", ""));
    if (
        ![startText, endText].every((value) => numberPattern.test(value)) ||
        ![start, end].every((value) => Number.isSafeInteger(value) && value > 0)
    ) {
        return invalid(
            "syntax",
            "Positions must be positive safe integers with correctly grouped commas."
        );
    }

    const a = names?.get(startName);
    const b = names?.get(endName);
    if (names && (start > a.size || end > b.size)) {
        return invalid("bounds", "Coordinate exceeds the contig bounds.");
    }
    const startChrom = a?.name ?? startName;
    const endChrom = b?.name ?? endName;
    if (
        (startChrom === endChrom && start > end) ||
        (assembly && assembly.contigs.indexOf(a) > assembly.contigs.indexOf(b))
    ) {
        return invalid("order", "Coordinate interval is reversed.");
    }
    return coordinate(startChrom, start - 1, endChrom, end);
}

/**
 * Without a dictionary, prefer cross-contig syntax over delimiter-containing names.
 * Also distinguishes malformed syntax from unknown names when dictionary lookup fails.
 * @param {string} query
 */
function syntaxCandidate(query) {
    const cross = query.match(/^(.+):([\d,]+)-(.+):([\d,]+)$/);
    if (cross) return cross.slice(1);
    const same = query.match(/^(.+):([\d,]+)(?:-([\d,]+))?$/);
    if (same) return [same[1], same[2], same[1], same[3] ?? same[2]];
}

/**
 * Contig names may themselves contain colons and hyphens. Each known prefix is
 * a possible left endpoint; the right endpoint ends at the final numeric suffix.
 * @param {string} query
 * @param {ReadonlyMap<string, {name: string, size: number}>} names
 */
function dictionaryCandidates(query, names) {
    /** @type {string[][]} */
    const candidates = [];
    for (
        let colon = query.indexOf(":");
        colon !== -1;
        colon = query.indexOf(":", colon + 1)
    ) {
        const startName = query.slice(0, colon);
        if (!names.has(startName)) continue;
        const rest = query.slice(colon + 1);
        const point = rest.match(/^([\d,]+)$/);
        const range = rest.match(/^([\d,]+)-([\d,]+)$/);
        const cross = rest.match(/^([\d,]+)-(.+):([\d,]+)$/);
        if (point) candidates.push([startName, point[1], startName, point[1]]);
        if (range) candidates.push([startName, range[1], startName, range[2]]);
        if (cross && names.has(cross[2]))
            candidates.push([startName, cross[1], cross[2], cross[3]]);
    }
    return candidates;
}

/**
 * Formats chromosome-relative half-open endpoints as one-based inclusive text.
 * Fractional positions cover the enclosing integer interval. Whole-genome
 * numeric offsets and cross-contig upper endpoints at zero require assembly
 * conversion before formatting.
 *
 * @param {import("./types/coordinates.js").CoordinateInterval} interval
 * @returns {string}
 */
export function formatCoordinates([begin, end]) {
    if (
        !begin.chrom ||
        !end.chrom ||
        !Number.isFinite(begin.pos) ||
        !Number.isFinite(end.pos) ||
        begin.pos < 0 ||
        end.pos <= 0 ||
        !Number.isSafeInteger(Math.floor(begin.pos)) ||
        !Number.isSafeInteger(Math.ceil(end.pos)) ||
        (begin.chrom === end.chrom && begin.pos >= end.pos)
    ) {
        throw new Error(
            "Expected a nonempty chromosome-relative half-open interval."
        );
    }
    return formatRange(begin, end);
}

/**
 * @param {string} chrom
 * @param {number} pos
 * @param {string} endChrom
 * @param {number} endPos
 * @returns {import("./types/coordinates.js").CoordinateQueryResult}
 */
function coordinate(chrom, pos, endChrom, endPos) {
    return {
        kind: "coordinate",
        interval: [
            { chrom, pos },
            { chrom: endChrom, pos: endPos },
        ],
    };
}

/**
 * @param {Extract<import("./types/coordinates.js").CoordinateQueryResult, {kind: "invalid-coordinate"}>["code"]} code
 * @param {string} message
 * @returns {import("./types/coordinates.js").CoordinateQueryResult}
 */
function invalid(code, message) {
    return { kind: "invalid-coordinate", code, message };
}
