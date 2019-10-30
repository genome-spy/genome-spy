import { compare, field as vuField } from 'vega-util';

import { groups as d3groups, sum as d3sum } from 'd3-array';

/**
 * @typedef {import("../../spec/transform").StackConfig} StackConfig
 */

 /**
  * 
  * @param {StackConfig} config 
  * @param {Object[]} rows 
  */
export default function stackTransform(config, rows) {
    const newRows = [];

    const as = config.as || ["y0", "y1"]; // TODO: Validate

    const groupFields = config.groupby.map(vuField);

    const groups = d3groups(rows, row => groupFields.map(f => f(row)).join())
        .map(a => a[1]);

    const accessor = config.field ? vuField(config.field) : row => 1;

    const comparator = config.sort ? compare(config.sort.field, config.sort.order) : undefined;

    const offsetF = config.offset == "normalize" ?
        (value, sum) => value / sum :
        (config.offset == "center" ?
            (value, sum) => value - (sum / 2) :
            (value, sum) => value)


    for (const group of groups) {
        if (comparator) {
            group.sort(comparator);
        }
        
        const sum = d3sum(group, accessor);

        let prev = 0;
        for (const row of group) {
            const current = prev + accessor(row);
            
            // TODO: Modify in-place if safe
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