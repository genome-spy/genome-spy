const MAX_PREVIEW_DEPTH = 3;
const MAX_PREVIEW_KEYS = 12;
const MAX_PREVIEW_ITEMS = 8;
const MAX_PREVIEW_STRING_LENGTH = 160;

/**
 * Creates a bounded preview of arbitrary runtime values for debug snapshots.
 *
 * @param {any} value
 * @param {number} [depth]
 * @returns {any}
 */
export function previewValue(value, depth = 0) {
    if (value == null || typeof value !== "object") {
        return previewScalar(value);
    }

    if (depth >= MAX_PREVIEW_DEPTH) {
        return Array.isArray(value)
            ? `[Array(${value.length})]`
            : `[Object(${Object.keys(value).length})]`;
    }

    if (Array.isArray(value)) {
        const preview = value
            .slice(0, MAX_PREVIEW_ITEMS)
            .map((item) => previewValue(item, depth + 1));
        if (value.length > MAX_PREVIEW_ITEMS) {
            preview.push(`... ${value.length - MAX_PREVIEW_ITEMS} more items`);
        }
        return preview;
    }

    /** @type {Record<string, any>} */
    const preview = {};
    const record = /** @type {Record<string, any>} */ (value);
    const keys = Object.keys(record);
    for (const key of keys.slice(0, MAX_PREVIEW_KEYS)) {
        preview[key] = previewValue(record[key], depth + 1);
    }
    if (keys.length > MAX_PREVIEW_KEYS) {
        preview["..."] = `${keys.length - MAX_PREVIEW_KEYS} more keys`;
    }
    return preview;
}

/**
 * @param {any} value
 * @returns {any}
 */
function previewScalar(value) {
    if (typeof value === "string" && value.length > MAX_PREVIEW_STRING_LENGTH) {
        return value.slice(0, MAX_PREVIEW_STRING_LENGTH) + "...";
    }

    return value;
}
