/**
 * @typedef {{message: string, count: number, cases: string[]}} ValidationErrorEntry
 */

/**
 * Validates metadata rows against the existing sample ids and reports either
 * structural errors or overlap statistics.
 *
 * @param {Iterable<string>} existingSamples
 * @param {Iterable<Record<string, any>>} metadataRecords
 * @returns {{
 *   error?: ValidationErrorEntry[];
 *   statistics?: {
 *     unknownSamples: Set<string>;
 *     notCoveredSamples: Set<string>;
 *     samplesInBoth: Set<string>;
 *   };
 * }}
 */
export function validateMetadata(existingSamples, metadataRecords) {
    /**
     * @type {Map<string, ValidationErrorEntry>}
     */
    const errorMap = new Map();

    /**
     * @param {string} message
     * @param {number} [count]
     * @param {string} [caseInfo]
     */
    function addError(message, count = 1, caseInfo = null) {
        let entry = errorMap.get(message);
        if (!entry) {
            entry = { message, count: 0, cases: [] };
            errorMap.set(message, entry);
        }
        entry.count += count;
        if (caseInfo) {
            entry.cases.push(caseInfo);
        }
    }

    const existingSamplesSet = new Set(existingSamples);
    /** @type {Set<string>} */
    const metadataSamplesSet = new Set();

    for (const record of metadataRecords) {
        if (!("sample" in record)) {
            addError(MISSING_SAMPLE_FIELD_ERROR);
            continue;
        }

        if (record.sample == null || record.sample === "") {
            addError(EMPTY_SAMPLE_FIELD_ERROR);
            continue;
        }

        const sampleId = String(record.sample);
        if (metadataSamplesSet.has(sampleId)) {
            addError(DUPLICATE_SAMPLE_IDS_ERROR, 1, sampleId);
        }
        metadataSamplesSet.add(sampleId);
    }

    if (metadataSamplesSet.size === 0) {
        addError(NO_VALID_SAMPLES_ERROR);
    }

    if (errorMap.size > 0) {
        return { error: Array.from(errorMap.values()) };
    } else {
        return {
            statistics: {
                unknownSamples:
                    metadataSamplesSet.difference(existingSamplesSet),
                notCoveredSamples:
                    existingSamplesSet.difference(metadataSamplesSet),
                samplesInBoth:
                    metadataSamplesSet.intersection(existingSamplesSet),
            },
        };
    }
}

export const MISSING_SAMPLE_FIELD_ERROR =
    "Missing sample field in metadata record";
export const EMPTY_SAMPLE_FIELD_ERROR = "Empty sample field in metadata record";
export const DUPLICATE_SAMPLE_IDS_ERROR =
    "Duplicate sample IDs found in metadata";
export const NO_VALID_SAMPLES_ERROR = "No valid samples found in metadata";
