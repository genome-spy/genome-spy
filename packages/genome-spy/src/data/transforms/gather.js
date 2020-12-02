/* eslint-disable guard-for-in */
/**
 * @typedef {import("../../spec/transform").GatherConfig} GatherConfig
 */

// See: https://vega.github.io/vega/docs/transforms/fold/

/**
 * @param {GatherConfig} gatherConfig
 * @param {any[]} rows Data parsed with d3.dsv
 */
export default function gatherTransform(gatherConfig, rows) {
    if (rows.length == 0) {
        return [];
    }

    const columnRegex = new RegExp(gatherConfig.columnRegex);

    const sampleKey = gatherConfig.asKey || "sample";
    const as = gatherConfig.asValue;

    const tidyRows = [];

    const propCache = [];
    const matchCache = [];
    for (let i = 0; i < 1000; i++) {
        propCache.push(undefined);
        matchCache.push(undefined);
    }

    for (const row of rows) {
        // Conserve memory by skipping the columns being gathered
        /** @type {Record<string, any>} */
        const strippedRow = {};
        for (const prop in row) {
            if (!columnRegex.test(prop)) {
                strippedRow[prop] = row[prop];
            }
        }

        let propIndex = 0;
        for (const prop in row) {
            let sampleId;

            if (propCache[propIndex] == prop) {
                sampleId = matchCache[propIndex];
            } else {
                const match = columnRegex.exec(prop);
                sampleId = match?.[1];
                propCache[propIndex] = prop;
                matchCache[propIndex] = sampleId;
            }
            propIndex++;

            if (sampleId !== undefined) {
                const tidyRow = Object.assign({}, strippedRow);
                tidyRow[sampleKey] = sampleId;
                tidyRow[as] = row[prop];
                tidyRows.push(tidyRow);
            }
        }
    }

    return tidyRows;
}
