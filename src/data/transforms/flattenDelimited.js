
/**
 * @typedef {Object} FlattenDelimitedConfig
 * @prop {string[]} separators
 * @prop {string[]} fields
 * @prop {string[]} [as]
 */

/**
 * 
 * @param {FlattenDelimitedConfig} config 
 * @param {object[]} rows 
 */
export default function flattenDelimitedTransform(config, rows) {
    const newRows = [];

    // TODO: Validate config. Check that arrays, equal lengths, string elements, etc...

    const separators = config.separators;
    const fields = config.fields;
    const as = config.as || config.fields;

    for (const row of rows) {
        if (fields.some(f => !row[f])) continue;

        const splitFields = fields.map((f, i) => row[f].split(separators[i]));
        validateSplit(splitFields, row);
        const flatLen = splitFields[0].length;

        for (let ri = 0; ri < flatLen; ri++) {
            const newRow = { ...row };
            for (let fi = 0; fi < fields.length; fi++) {
                newRow[as[fi]] = splitFields[fi][ri];
            }
            newRows.push(newRow);
        }
    }

    return newRows;
}

function validateSplit(splitFields, row) {
    const splitLengths = splitFields.map(f => f.length);
    if (!splitLengths.every(x => x == splitLengths[0])) {
        throw new Error("Mismatching number of elements in fields to be split: " + JSON.stringify(row));
    }
}