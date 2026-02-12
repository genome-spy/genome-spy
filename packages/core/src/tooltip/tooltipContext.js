/**
 * @typedef {import("./tooltipHandler.js").TooltipContext} TooltipContext
 * @typedef {import("./tooltipHandler.js").TooltipGenomicDisplayMode} TooltipGenomicDisplayMode
 * @typedef {import("./tooltipHandler.js").TooltipRow} TooltipRow
 */

import { asArray } from "../utils/arrayUtils.js";
import { flattenDatumRows } from "./flattenDatumRows.js";

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
    const mappingByLinearizedField = collectLinearizationMappings(mark);

    const xGenomic = buildGenomicRowsForAxis(
        "x",
        datum,
        mark,
        mappingByLinearizedField,
        getConfiguredMode(params, "x")
    );
    const yGenomic = buildGenomicRowsForAxis(
        "y",
        datum,
        mark,
        mappingByLinearizedField,
        getConfiguredMode(params, "y")
    );

    const useAxisPrefixes =
        xGenomic.rows.length > 0 && yGenomic.rows.length > 0;

    /** @type {TooltipRow[]} */
    const genomicRows = [
        ...(useAxisPrefixes
            ? prefixGenomicRows("x", xGenomic.rows)
            : xGenomic.rows),
        ...(useAxisPrefixes
            ? prefixGenomicRows("y", yGenomic.rows)
            : yGenomic.rows),
    ];

    /** @type {Set<string>} */
    const hiddenRowKeys = new Set();
    for (const axisGenomic of [xGenomic, yGenomic]) {
        for (const field of axisGenomic.usedLinearizedFields) {
            const mapping = mappingByLinearizedField.get(field);
            if (!mapping || mapping.ambiguous) {
                continue;
            }

            const verified = verifyLinearizationMapping(
                datum,
                field,
                mapping,
                mark
            );
            if (verified) {
                hiddenRowKeys.add(mapping.chrom);
                hiddenRowKeys.add(mapping.pos);
            }
        }
    }

    return {
        hiddenRowKeys: [...hiddenRowKeys],
        genomicRows,
        flattenDatumRows: () => flattenDatumRows(datum),
        formatGenomicLocus: (axis, continuousPos) =>
            formatGenomicLocus(mark, axis, continuousPos),
        formatGenomicInterval: (axis, interval) =>
            formatGenomicInterval(mark, axis, interval),
    };
}

/**
 * @param {"x" | "y"} axis
 * @param {TooltipRow[]} rows
 * @returns {TooltipRow[]}
 */
function prefixGenomicRows(axis, rows) {
    const axisPrefix = axis.toUpperCase() + " ";
    return rows.map((row) => ({
        key: axisPrefix + row.key,
        value: row.value,
    }));
}

/**
 * @param {"x" | "y"} axis
 * @param {Record<string, any>} datum
 * @param {import("../marks/mark.js").default} mark
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>} mappingByLinearizedField
 * @param {TooltipGenomicDisplayMode} mode
 * @returns {{ rows: TooltipRow[], usedLinearizedFields: Set<string> }}
 */
function buildGenomicRowsForAxis(
    axis,
    datum,
    mark,
    mappingByLinearizedField,
    mode
) {
    /** @type {Set<string>} */
    const usedLinearizedFields = new Set();

    if (mode === "disabled") {
        return {
            rows: [],
            usedLinearizedFields,
        };
    }

    const primary = readLocusCoordinate(mark, axis, datum);
    if (!primary) {
        return {
            rows: [],
            usedLinearizedFields,
        };
    }
    if (primary.field) {
        usedLinearizedFields.add(primary.field);
    }

    const secondary = readLocusCoordinate(mark, SECONDARY_AXIS[axis], datum);
    if (secondary?.field) {
        usedLinearizedFields.add(secondary.field);
    }

    /** @type {TooltipGenomicDisplayMode} */
    const effectiveMode =
        mode === "auto"
            ? resolveAutoMode(primary, secondary, mappingByLinearizedField)
            : mode;

    if (effectiveMode === "endpoints" && secondary) {
        const [endpoint1, endpoint2] = orderEndpointsByFieldHints(
            primary,
            secondary,
            mappingByLinearizedField
        );

        return {
            rows: [
                {
                    key: "Endpoint 1",
                    value:
                        formatGenomicLocus(mark, axis, endpoint1.value) ??
                        String(endpoint1.value),
                },
                {
                    key: "Endpoint 2",
                    value:
                        formatGenomicLocus(mark, axis, endpoint2.value) ??
                        String(endpoint2.value),
                },
            ],
            usedLinearizedFields,
        };
    }

    if (effectiveMode === "interval" && secondary) {
        return {
            rows: [
                {
                    key: "Interval",
                    value:
                        formatGenomicInterval(mark, axis, [
                            primary.value,
                            secondary.value,
                        ]) ?? primary.value + " - " + secondary.value,
                },
            ],
            usedLinearizedFields,
        };
    }

    return {
        rows: [
            {
                key: "Coordinate",
                value:
                    formatGenomicLocus(mark, axis, primary.value) ??
                    String(primary.value),
            },
        ],
        usedLinearizedFields,
    };
}

/**
 * @param {{ field?: string }} primary
 * @param {{ field?: string } | undefined} secondary
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>} mappingByLinearizedField
 * @returns {TooltipGenomicDisplayMode}
 */
function resolveAutoMode(primary, secondary, mappingByLinearizedField) {
    if (!secondary) {
        return "locus";
    }

    const primaryGroup = getMappingGroup(
        primary.field,
        mappingByLinearizedField
    );
    const secondaryGroup = getMappingGroup(
        secondary.field,
        mappingByLinearizedField
    );

    if (primaryGroup && secondaryGroup && primaryGroup !== secondaryGroup) {
        return "endpoints";
    }

    // Default to interval when grouping cannot be inferred.
    return "interval";
}

/**
 * @param {string | undefined} field
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>} mappingByLinearizedField
 */
function getMappingGroup(field, mappingByLinearizedField) {
    const mapping = field ? mappingByLinearizedField.get(field) : undefined;
    return mapping && !mapping.ambiguous ? mapping.groupId : undefined;
}

/**
 * Heuristically preserves endpoint numbering from source fields. If one
 * endpoint is recognized as "2" (or the other as "1"), swap display order.
 *
 * @param {{ value: number, field?: string }} primary
 * @param {{ value: number, field?: string }} secondary
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>} mappingByLinearizedField
 */
function orderEndpointsByFieldHints(
    primary,
    secondary,
    mappingByLinearizedField
) {
    const firstHint = inferEndpointOrdinal(
        primary.field,
        mappingByLinearizedField
    );
    const secondHint = inferEndpointOrdinal(
        secondary.field,
        mappingByLinearizedField
    );

    if (firstHint === 2 && secondHint !== 2) {
        return [secondary, primary];
    }

    if (secondHint === 1 && firstHint !== 1) {
        return [secondary, primary];
    }

    if (firstHint === 2 && secondHint === 1) {
        return [secondary, primary];
    }

    return [primary, secondary];
}

/**
 * @param {string | undefined} linearizedField
 * @param {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>} mappingByLinearizedField
 * @returns {1 | 2 | undefined}
 */
function inferEndpointOrdinal(linearizedField, mappingByLinearizedField) {
    const mapping = linearizedField
        ? mappingByLinearizedField.get(linearizedField)
        : undefined;
    /** @type {(string | undefined)[]} */
    const candidates = [mapping?.pos, mapping?.chrom, linearizedField];

    /** @type {1 | 2 | undefined} */
    let ordinal;
    for (const candidate of candidates) {
        const detected = detectEndpointOrdinal(candidate);
        if (detected === undefined) {
            continue;
        }
        if (ordinal === undefined) {
            ordinal = detected;
        } else if (ordinal !== detected) {
            return undefined;
        }
    }

    return ordinal;
}

/**
 * @param {string | undefined} fieldName
 * @returns {1 | 2 | undefined}
 */
function detectEndpointOrdinal(fieldName) {
    if (!fieldName) {
        return undefined;
    }

    const normalized = fieldName.toLowerCase();

    const trailing = normalized.match(/(?:^|[^0-9])(1|2)$/);
    if (trailing) {
        return trailing[1] === "1" ? 1 : 2;
    }

    const word = normalized.match(/(?:^|[_-])(first|second)(?:[_-]|$)/);
    if (word) {
        return word[1] === "first" ? 1 : 2;
    }

    return undefined;
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
 * @returns {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>}
 */
function collectLinearizationMappings(mark) {
    /** @type {Map<string, {groupId: string, chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean}>} */
    const mappingByField = new Map();

    let group = 0;
    const collector = mark.unitView?.getCollector?.();
    let current = collector?.parent;
    while (current) {
        const params = /** @type {any} */ (current).params;
        if (params?.type === "linearizeGenomicCoordinate") {
            const as = asArray(params.as);
            const pos = asArray(params.pos);
            const offsets = normalizeOffsets(params.offset, pos.length);
            const groupId = "g" + group++;
            const channel = params.channel === "y" ? "y" : "x";

            for (let i = 0; i < as.length; i++) {
                if (i >= pos.length) {
                    continue;
                }

                const existing = mappingByField.get(as[i]);
                if (existing) {
                    existing.ambiguous = true;
                } else {
                    mappingByField.set(as[i], {
                        groupId,
                        chrom: params.chrom,
                        pos: pos[i],
                        offset: offsets[i],
                        channel,
                        ambiguous: false,
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
 * @param {Record<string, any>} datum
 * @param {string} linearizedField
 * @param {{ chrom: string, pos: string, offset: number, channel: "x" | "y", ambiguous: boolean }} mapping
 * @param {import("../marks/mark.js").default} mark
 */
function verifyLinearizationMapping(datum, linearizedField, mapping, mark) {
    // TODO: This picks a genome by transform channel. In mixed-axis or
    // mixed-assembly cases, verify against both active genomic axes.
    const genome = getGenome(mark, mapping.channel);
    if (!genome) {
        return false;
    }

    const chrom = datum[mapping.chrom];
    const pos = datum[mapping.pos];
    const linearized = datum[linearizedField];

    if (chrom === undefined || pos === undefined || linearized === undefined) {
        return false;
    }

    const numericPos = +pos;
    const numericLinearized = +linearized;

    if (!Number.isFinite(numericPos) || !Number.isFinite(numericLinearized)) {
        return false;
    }

    let expected;
    try {
        expected = genome.toContinuous(chrom, numericPos - mapping.offset);
    } catch (_error) {
        return false;
    }

    return Math.abs(expected - numericLinearized) < 1e-6;
}
