import { asArray } from "../../utils/arrayUtils";

/**
 * @typedef {import("../../spec/transform").FlattenDelimitedConfig} FlattenDelimitedConfig
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

    // TODO: Validate config. string elements, etc...

    const fields = asArray(config.field);
    const separators = asArray(config.separator);
    const as = asArray(config.as || config.field);

    if (fields.length !== separators.length || fields.length !== as.length) {
        throw new Error(`Lengths of "separator" (${separators.length}), "fields" (${fields.length}), and "as" (${as.length}) do not match!`)
    }

    if (!fields.length) {
        return;
    }

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
        throw new Error("Mismatching number of elements in the fields to be split: " + JSON.stringify(row));
    }
}
