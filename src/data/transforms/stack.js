import { accessor as dlAccessor, compare } from 'vega-util';

import {
    // TODO: Find replacements to get rid of datalib
    groupby as dlGroupby,
    sum as dlSum
} from 'datalib';

/**
 * 
 * @typedef {Object} Compare
 * @prop {String[] | String} field
 * @prop {String[] | String} order
 * 
 * @typedef {Object} StackConfig
 * @prop {String} [field] Constant value 1 if the field is not defined
 * @prop {String[]} groupby
 * @prop {Compare} [sort]
 * @prop {String} [offset] zero / center / normalize
 * @prop {String[]} [as]
 */

 /**
  * 
  * @param {StackConfig} config 
  * @param {Object[]} rows 
  */
export default function stackTransform(config, rows) {
    const newRows = [];

    const as = config.as || ["y0", "y1"]; // TODO: Validate

    const groups = dlGroupby(config.groupby)
        .execute(rows)

    const accessor = config.field ? dlAccessor(config.field) : row => 1;

    const comparator = createComparator(config.sort);

    const offsetF = config.offset == "normalize" ?
        (value, sum) => value / sum :
        (config.offset == "center" ?
            (value, sum) => value - (sum / 2) :
            (value, sum) => value)


    for (const group of groups) {
        group.values.sort(comparator);
        
        const sum = dlSum(group.values, accessor);

        let prev = 0;
        for (const row of group.values) {
            const current = prev + accessor(row);
            
            newRows.push({
                ...row,
                [as[0]]: offsetF(prev, sum),
                [as[1]]: offsetF(current, sum)
            });

            prev = current;
        }
    }

    return newRows;
}

/**
 * TODO: Move to utilities
 * 
 * @param {Compare} compareDef 
 */
function createComparator(compareDef) {
    if (!compareDef) {
        return (a, b) => 0;
    }

    // TODO: Check validity

    const fields = asArray(compareDef.field);
    const orders = compareDef.order ?
        asArray(compareDef.order) :
        fields.map(f => "ascending");

    return compare(fields.map((field, i) => (orders[i] == "ascending" ? "+" : "-") + field));
}

/**
 * TODO: Move to utilities
 * 
 * @param {any[] | any} obj 
 */
function asArray(obj) {
    if (Array.isArray(obj)) {
        return obj;

    } else if (typeof obj != "undefined") {
        return [obj]

    } else {
        return [];
    }
} 