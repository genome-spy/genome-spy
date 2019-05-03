// See: https://observablehq.com/@tuner/histogram-equalization

import { accessor as dlAccessor } from 'datalib';
import { bisectRight } from 'd3-array';

/**
 * @typedef {Object} EqualizeConfig
 * @prop {string} field
 * @prop {number} [buckets] Default 50
 * @prop {string} [as] Defaults to field
 */

 /**
  * 
  * @param {EqualizeConfig} equalizeConfig 
  * @param {object[]} rows 
  */
export default function equalizeTransform(equalizeConfig, rows) {
    const accessor = dlAccessor(equalizeConfig.field);
    const as = equalizeConfig.as || equalizeConfig.field;

    const equalizer = createEqualizer(rows.map(accessor), equalizeConfig.buckets || 50);

    return rows.map(row => ({
        ...row,
        [as]: equalizer(accessor(row))
    }));
}

function computeBucketBoundaries(values, bucketCount) {
    const sortedValues = [...values.filter(x => typeof x == "number" && !isNaN(x))].sort((a, b) => a - b);
    const boundaries = [];
    for (let i = 0; i <= bucketCount; i++) {
        boundaries.push(sortedValues[Math.floor((sortedValues.length - 1) * i / bucketCount)]);
    }
    return boundaries;
}


function createEqualizer(sampleData, bucketCount) {
    const buckets = computeBucketBoundaries(sampleData, bucketCount);
    const len = buckets.length;

    function equalize(value) {
        const i = bisectRight(buckets, value) - 1;
        if (i == len - 1) {
            return 1;
        } else if (i == -1) {
            return 0;
        } else {
            const a = buckets[i];
            const b = buckets[i + 1];
            const ratio = (value - a) / (b - a);
            return (i + ratio) / (len - 1);
        }
    }

    equalize.buckets = buckets;

    return equalize;
}