/**
 * @typedef {import("./tooltipHandler.js").TooltipContext} TooltipContext
 * @typedef {import("./tooltipHandler.js").TooltipGenomicDisplayMode} TooltipGenomicDisplayMode
 * @typedef {import("./tooltipHandler.js").TooltipRow} TooltipRow
 */

import { asArray } from "../utils/arrayUtils.js";

const PRIMARY_AXES = /** @type {const} */ (["x", "y"]);
/** @type {Record<"x" | "y", "x2" | "y2">} */
const SECONDARY_AXIS = {
    x: "x2",
    y: "y2",
};

/** @type {Set<string>} */
const GENOMIC_MODES = new Set([
    "auto",
    "locus",
    "interval",
    "endpoints",
    "disabled",
]);

/**
 * Creates a stable context object for tooltip handlers.
 *
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @param {import("./tooltipHandler.js").TooltipHandlerParams} [params]
 * @returns {TooltipContext}
 */
export default function createTooltipContext(datum, mark, params) {
    /** @type {TooltipRow[]} */
    const rows = [];
    collectRows(Object.entries(datum), rows);

    const mappingByLinearizedField = collectLinearizationMappings(mark);

    /** @type {TooltipRow[]} */
    const genomicRows = [];
    for (const axis of PRIMARY_AXES) {
        genomicRows.push(
            ...buildGenomicRowsForAxis(
                axis,
                datum,
                mark,
                mappingByLinearizedField,
                getConfiguredMode(params, axis)
            )
        );
    }

    return {
        rows,
        getRows: () => rows,
        hiddenRowKeys: [],
        genomicRows,
        getGenomicRows: () => genomicRows,
        formatGenomicLocus: (axis, continuousPos) =>
            formatGenomicLocus(mark, axis, continuousPos),
        formatGenomicInterval: (axis, interval) =>
            formatGenomicInterval(mark, axis, interval),
    };
}

/**
 * @param {"x" | "y"} axis
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number}>} mappingByLinearizedField
 * @param {TooltipGenomicDisplayMode} mode
 * @returns {TooltipRow[]}
 */
function buildGenomicRowsForAxis(
    axis,
    datum,
    mark,
    mappingByLinearizedField,
    mode
) {
    if (mode === "disabled") {
        return [];
    }

    const primary = readLocusCoordinate(mark, axis, datum);
    if (!primary) {
        return [];
    }

    const secondary = readLocusCoordinate(mark, SECONDARY_AXIS[axis], datum);

    /** @type {TooltipGenomicDisplayMode} */
    const effectiveMode =
        mode === "auto"
            ? resolveAutoMode(primary, secondary, mappingByLinearizedField)
            : mode;

    const keyPrefix = axis === "x" ? "" : axis + " ";

    if (effectiveMode === "endpoints" && secondary) {
        return [
            {
                key: keyPrefix + "endpoint 1",
                value:
                    formatGenomicLocus(mark, axis, primary.value) ??
                    String(primary.value),
            },
            {
                key: keyPrefix + "endpoint 2",
                value:
                    formatGenomicLocus(mark, axis, secondary.value) ??
                    String(secondary.value),
            },
        ];
    }

    if (effectiveMode === "interval" && secondary) {
        return [
            {
                key: keyPrefix + "interval",
                value:
                    formatGenomicInterval(mark, axis, [
                        primary.value,
                        secondary.value,
                    ]) ?? primary.value + " - " + secondary.value,
            },
        ];
    }

    return [
        {
            key: keyPrefix + "locus",
            value:
                formatGenomicLocus(mark, axis, primary.value) ??
                String(primary.value),
        },
    ];
}

/**
 * @param {{ field?: string }} primary
 * @param {{ field?: string } | undefined} secondary
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number}>} mappingByLinearizedField
 * @returns {TooltipGenomicDisplayMode}
 */
function resolveAutoMode(primary, secondary, mappingByLinearizedField) {
    if (!secondary) {
        return "locus";
    }

    const primaryGroup = primary.field
        ? mappingByLinearizedField.get(primary.field)?.groupId
        : undefined;
    const secondaryGroup = secondary.field
        ? mappingByLinearizedField.get(secondary.field)?.groupId
        : undefined;

    if (primaryGroup && secondaryGroup && primaryGroup !== secondaryGroup) {
        return "endpoints";
    }

    return "interval";
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @param {"x" | "x2" | "y" | "y2"} channel
 * @param {Record<string, any>} datum
 * @returns {{ value: number, field?: string } | undefined}
 */
function readLocusCoordinate(mark, channel, datum) {
    const encoder = mark.encoders?.[channel];
    if (encoder?.scale?.type !== "locus") {
        return;
    }

    const accessor = encoder.dataAccessor;
    if (!accessor) {
        return;
    }

    const value = +accessor(datum);
    if (!Number.isFinite(value)) {
        return;
    }

    return {
        value,
        field: accessor.fields?.length === 1 ? accessor.fields[0] : undefined,
    };
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @returns {Map<string, {groupId: string, chrom: string, pos: string, offset: number}>}
 */
function collectLinearizationMappings(mark) {
    /** @type {Map<string, {groupId: string, chrom: string, pos: string, offset: number}>} */
    const mappingByField = new Map();

    let group = 0;
    let current = mark.unitView.getCollector()?.parent;
    while (current) {
        const params = /** @type {any} */ (current).params;
        if (params?.type === "linearizeGenomicCoordinate") {
            const as = asArray(params.as);
            const pos = asArray(params.pos);
            const offsets = normalizeOffsets(params.offset, pos.length);
            const groupId = "g" + group++;

            for (let i = 0; i < as.length; i++) {
                if (i < pos.length && !mappingByField.has(as[i])) {
                    mappingByField.set(as[i], {
                        groupId,
                        chrom: params.chrom,
                        pos: pos[i],
                        offset: offsets[i],
                    });
                }
            }
        }
        current = current.parent;
    }

    return mappingByField;
}

/**
 * @param {number | number[] | undefined} offset
 * @param {number} count
 * @returns {number[]}
 */
function normalizeOffsets(offset, count) {
    const offsets = asArray(offset);

    if (offsets.length === 0) {
        return new Array(count).fill(0);
    }
    if (offsets.length === 1) {
        return new Array(count).fill(offsets[0]);
    }
    if (offsets.length === count) {
        return offsets;
    }

    return new Array(count).fill(0);
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @param {"x" | "y"} axis
 * @param {number} continuousPos
 * @returns {string | undefined}
 */
function formatGenomicLocus(mark, axis, continuousPos) {
    const genome = getGenome(mark, axis);
    return genome?.formatLocus(continuousPos);
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @param {"x" | "y"} axis
 * @param {[number, number]} interval
 * @returns {string | undefined}
 */
function formatGenomicInterval(mark, axis, interval) {
    const genome = getGenome(mark, axis);
    return genome?.formatInterval(interval);
}

/**
 * @param {import("../marks/mark.js").default} mark
 * @param {"x" | "y"} axis
 */
function getGenome(mark, axis) {
    const scale = mark.encoders?.[axis]?.scale;
    return scale?.type === "locus" && "genome" in scale
        ? scale.genome()
        : undefined;
}

/**
 * @param {import("./tooltipHandler.js").TooltipHandlerParams | undefined} params
 * @param {"x" | "y"} axis
 * @returns {TooltipGenomicDisplayMode}
 */
function getConfiguredMode(params, axis) {
    const configured = params?.genomicCoordinates?.[axis];
    const mode =
        typeof configured === "string"
            ? configured
            : (configured?.mode ?? "auto");

    if (!GENOMIC_MODES.has(mode)) {
        throw new Error(
            'Unknown genomic coordinate display mode: "' + mode + '"'
        );
    }

    return /** @type {TooltipGenomicDisplayMode} */ (mode);
}

/**
 * @param {[string, any][]} entries
 * @param {TooltipRow[]} output
 * @param {string} [prefix]
 */
function collectRows(entries, output, prefix) {
    for (const [key, value] of entries) {
        if (key.startsWith("_")) {
            continue;
        }

        if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            collectRows(
                Object.entries(value),
                output,
                (prefix ? prefix : "") + key + "."
            );
        } else {
            output.push({
                key: (prefix ? prefix : "") + key,
                value: value,
            });
        }
    }
}
