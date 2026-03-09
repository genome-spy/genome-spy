import BED from "@gmod/bed";

const controlLinePrefixes = ["browser", "track", "#"];

const fallbackFieldSpecs = [
    ["field6", "thickStart", "number"],
    ["field7", "thickEnd", "number"],
    ["field8", "itemRgb", "string"],
    ["field9", "blockCount", "number"],
    ["field10", "blockSizes", "numberArray"],
    ["field11", "blockStarts", "numberArray"],
];

/**
 * @param {string} line
 */
function isSkippableBedLine(line) {
    const trimmed = line.trim();
    return (
        trimmed.length == 0 ||
        controlLinePrefixes.some((prefix) => trimmed.startsWith(prefix))
    );
}

/**
 * @param {string} value
 */
function parseNumber(value) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
}

/**
 * @param {string} value
 */
function parseNumberArray(value) {
    const values = value.split(",").filter((v) => v.length > 0);
    const parsed = values.map(Number);

    return parsed.some((v) => Number.isNaN(v)) ? values : parsed;
}

/**
 * @param {Record<string, any>} feature
 */
function canonicalizeFallbackFields(feature) {
    for (const [sourceField, targetField, targetType] of fallbackFieldSpecs) {
        if (sourceField in feature && !(targetField in feature)) {
            const rawValue = feature[sourceField];
            delete feature[sourceField];

            if (targetType == "number") {
                feature[targetField] = parseNumber(rawValue);
            } else if (targetType == "numberArray") {
                feature[targetField] = parseNumberArray(rawValue);
            } else {
                feature[targetField] = rawValue;
            }
        }
    }
}

/**
 * @param {Record<string, any>} feature
 * @returns {Record<string, any>}
 */
function normalizeFeature(feature) {
    canonicalizeFallbackFields(feature);

    if (
        typeof feature.chromStart != "number" ||
        typeof feature.chromEnd != "number"
    ) {
        throw new Error("BED row is missing chromStart/chromEnd coordinates.");
    }

    feature.start = feature.chromStart;
    feature.end = feature.chromEnd;

    return feature;
}

/**
 * Parse BED text data.
 *
 * @param {string} data
 * @returns {Record<string, any>[]}
 */
export default function bed(data) {
    const parser = new /** @type {any} */ (BED)();

    /** @type {Record<string, any>[]} */
    const rows = [];

    const lines = data.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (isSkippableBedLine(line)) {
            continue;
        }

        try {
            rows.push(normalizeFeature(parser.parseLine(line)));
        } catch (error) {
            throw new Error(
                `Cannot parse BED line ${i + 1}: ${
                    /** @type {Error} */ (error).message
                }`
            );
        }
    }

    return rows;
}
