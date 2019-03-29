
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
function transformData(transformConfigs, rows) {
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
 * @param {LayerConfig} dataConfig 
 * @param {object[]} rows 
 * @param {import("./visualEncoders").VisualMapperFactory} mapperFactory
 * @param {Object} visualVariables
 */
export function processData(dataConfig, rows, mapperFactory, visualVariables) {

    // TODO: Validate that data contains all fields that are referenced in the config.
    // ... just to prevent mysterious undefineds

    if (dataConfig.transform) {
        rows = transformData(dataConfig.transform, rows);
    }

    const encode = createCompositeEncodingMapper(mapperFactory, dataConfig.encoding, visualVariables, rows);

    // TODO: Check that dataConfig.sample matches sample of gatherTransform
    // TODO: Support data that has just a single sample (no sample column)
    const extractSample = d => d[dataConfig.sample];
    
    const mappedRows = rows.map(d => encode(d));

    /**
     * @typedef {import('../gl/segmentsToVertices').PointSpec} PointSpec
     * @type {Map<string, PointSpec[]>}
     */
    const pointsBySample = new Map();

    const addSpec = (sampleId, spec) => {
        let specs = pointsBySample.get(sampleId);
        if (specs) {
            specs.push(spec);
        } else {
            pointsBySample.set(sampleId, [spec]);
        }
    }
    
    mappedRows.forEach((spec, i) => addSpec(extractSample(rows[i]), spec));

    return pointsBySample;
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
