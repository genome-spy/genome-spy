/**
 * @typedef {Object} GatherConfig
 * @prop {string} type
 * @prop {string} columnRegex
 * @prop {string} asValue
 * @prop {string} [asKey] Default: sample
 */

/**
 * @param {GatherConfig} gatherConfig
 * @param {Object[]} rows Data parsed with d3.dsv
 */
export function gather(gatherConfig, rows) {
    
    const columnRegex = new RegExp(gatherConfig.columnRegex);

    /** @type {string[]} */
    const sampleColumns = rows.columns.filter(k => columnRegex.test(k));

    /** @type {Map<string, object>} */
    const gatheredFields = new Map();

    for (const sampleColumn of sampleColumns) {
        const sampleId = columnRegex.exec(sampleColumn)[1];

        const datums = rows.map(row => ({
            // TODO: Multiple fields 
            [gatherConfig.asValue]: row[sampleColumn]
        }));
        
        gatheredFields.set(sampleId, datums);
    }

    return gatheredFields;
}


export default function gatherTransform(gatherConfig, rows) {
    const columnRegex = new RegExp(gatherConfig.columnRegex);
    const gatheredFields = gather(gatherConfig, rows);

    // Conserve memory by skipping columns being gathered
    const strippedRows = rows.map(row => {
        const newRow = {};
        for (const prop of Object.keys(row)) {
            if (!columnRegex.test(prop)) {
                newRow[prop] = row[prop];
            }
        }
        return newRow;
    });

    const tidyRows = [];

    for (const [sampleId, gatheredRowsOfSample] of gatheredFields.entries()) {
        for (let i = 0; i < gatheredRowsOfSample.length; i++) {
            tidyRows.push({
                [gatherConfig.asKey || "sample"]: sampleId,
                ...strippedRows[i],
                ...gatheredRowsOfSample[i],
            });
        }
    }
    
    return tidyRows;
}