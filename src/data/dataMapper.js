
import { formalizeEncodingConfig, createFieldEncodingMapper, createCompositeEncodingMapper } from './visualEncoders';
import { gatherTransform } from './transforms/gather';

/**
 * @typedef {Object} SimpleFilterConfig
 * @prop {string} field 
 * @prop {string} operator eq, neq, lt, lte, gte, gt
 * @prop {*} value
 * 
 */

const transformers = {
    gather: gatherTransform,
    simpleFilter: simpleFilterTransform
};

/**
 * 
 * @param {object[]} transformConfigs 
 */
export function transformData(transformConfigs, rows) {
    for (const transformConfig of transformConfigs) {
        const type = transformConfig.type;
        if (!type) {
            throw new Error("Type not defined in transformConfig!");
        }

        const transformer = transformers[type];
        if (!transformer) {
            throw new Error(`Unknown transformer type: ${type}`);
        }

        rows = transformer(transformConfig, rows);
    }

    return rows;
}

/**
 * 
 * @param {object[]} encodingConfigs 
 * @param {object[]} rows 
 * @param {import("./visualEncoders").VisualMapperFactory} mapperFactory
 * @returns {object[]}
 */
export function processData(encodingConfigs, rows, mapperFactory) {

    // TODO: Validate that data contains all fields that are referenced in the config.
    // ... just to prevent mysterious undefineds

    const encode = createCompositeEncodingMapper(mapperFactory, encodingConfigs, rows);

    return rows.map(d => encode(d));
}

/**
 * 
 * @param {object[]} rows The original data
 * @param {object[]} specs The specs based on the rows
 * @param {function(object):string} sampleExtractor
 * @returns {Map<string, object[]>}
 */
export function groupBySample(rows, specs, sampleExtractor) {
    /** @type {Map<string, object[]>} */
    const specsBySample = new Map();

    const addSpec = (sampleId, spec) => {
        let specs = specsBySample.get(sampleId);
        if (specs) {
            specs.push(spec);
        } else {
            specsBySample.set(sampleId, [spec]);
        }
    }

    specs.forEach((spec, i) => addSpec(sampleExtractor(rows[i]), spec));

    return specsBySample;
}



/**
 * 
 * @param {SimpleFilterConfig} simpleFilterConfig 
 * @param {Object[]} rows
 */
export function simpleFilterTransform(simpleFilterConfig, rows) {
    return rows.filter(createFilter(simpleFilterConfig));
}

/**
 * 
 * @param {SimpleFilterConfig} filterConfig 
 */
 export function createFilter(filterConfig) {
     const v = filterConfig.value;

     const accessor = x => x[filterConfig.field];

     // Assume that x is a string. Not very robust, but should be enough for now
     switch (filterConfig.operator) {
         case "eq":  return x => accessor(x) == v;
         case "neq": return x => accessor(x) != v;
         case "lt":  return x => accessor(x) < v;
         case "lte": return x => accessor(x) <= v;
         case "gte": return x => accessor(x) >= v;
         case "gt":  return x => accessor(x) > v;
         default:
            throw new Error(`Unknown operator: ${filterConfig.operator}`);
     }
 }
