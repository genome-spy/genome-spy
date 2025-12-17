/**
 * Convert row-oriented data (array of objects) to columnar format (object of arrays).
 * All objects must have identical keys.
 *
 * @param {Array<Record<string, any>>} rows - Array of objects with identical shape
 * @returns {Record<string, any[]>} Object where each key maps to an array of values
 */
export function rowsToColumns(rows) {
    if (rows.length === 0) {
        return {};
    }

    const firstRow = rows[0];
    const keys = Object.keys(firstRow);
    /** @type {Record<string, any[]>} */
    const columns = {};

    for (const key of keys) {
        columns[key] = rows.map((row) => row[key]);
    }

    return columns;
}

/**
 * Convert columnar data (object of arrays) to row-oriented format (array of objects).
 * All arrays must have identical lengths.
 *
 * @param {Record<string, any[]>} columns - Object where each key maps to an array of values
 * @returns {Array<Record<string, any>>} Array of objects with identical shape
 */
export function columnsToRows(columns) {
    const keys = Object.keys(columns);

    if (keys.length === 0) {
        return [];
    }

    const length = columns[keys[0]]?.length ?? 0;

    // Validate all arrays have the same length
    for (const key of keys) {
        if (!Array.isArray(columns[key])) {
            throw new Error(`Column "${key}" is not an array`);
        }
        if (columns[key].length !== length) {
            throw new Error(
                `All columns must have identical lengths; "${key}" has length ${columns[key].length}, expected ${length}`
            );
        }
    }

    const rows = [];
    for (let i = 0; i < length; i++) {
        /** @type {Record<string, any>} */
        const row = {};
        for (const key of keys) {
            row[key] = columns[key][i];
        }
        rows.push(row);
    }

    return rows;
}
