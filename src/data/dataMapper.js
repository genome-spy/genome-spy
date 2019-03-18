
import { formalizeEncodingConfig, createEncodingMapper } from '../data/visualScales';

/**
 * @typedef {Object} GatherConfig
 * @prop {string} columnRegex
 * @prop {string} as 
 * 
 * @typedef {Object} SimpleFilterConfig
 * @prop {string} field 
 * @prop {string} operator eq, neq, lt, lte, gte, gt
 * @prop {*} value
 * 
 * @typedef {Object} VariantDataConfig
 *    A configuration that specifies how data should be mapped
 *    to PointSpecs. The ultimate aim is to make this very generic
 *    and applicable to multiple types of data and visual encodings.
 * @prop {GatherConfig[]} gather
 * @prop {string} chrom
 * @prop {string} pos
 * @prop {Object} encoding 
 * @prop {SimpleFilterConfig[]} filters
 */

// TODO: Make enum, include constraints for ranges, etc, maybe some metadata (description)
const visualVariables = {
    color: { type: "color" },
    size: { type: "number" }
};


/**
 * 
 * @param {VariantDataConfig} dataConfig 
 * @param {object[]} rows 
 * @param {import("../genome/genome").default} genome 
 */
export function processData(dataConfig, rows, genome) {
    const cm = genome.chromMapper;

    // TODO: Move parsing, gathering, etc logic to a separate module.
    // TODO: Make this more abstract and adapt for segments too
    // TODO: Split into smaller functions

    /**
     * Now we assume that attribute is gathered if it is not in shared.
     * TODO: Throw an exception if it's was not published from gathered data
     */
    const isShared = field => rows.columns.indexOf(field) >= 0;

    const createCompositeMapper = (
        /** @type {function(string):boolean} */inclusionPredicate,
        /** @type {object[]} */sampleData
    ) => {
        const mappers = {};

        Object.entries(dataConfig.encoding || {})
            .forEach(([/** @type {string} */visualVariable, /** @type {EncodingConfig} */encodingConfig]) => {
                if (!visualVariables[visualVariable]) {
                    throw `Unknown visual variable: ${visualVariable}`;
                }

                encodingConfig = formalizeEncodingConfig(encodingConfig);

                if (inclusionPredicate(encodingConfig.field)) {
                    mappers[visualVariable] = createEncodingMapper(
                        visualVariables[visualVariable].type,
                        encodingConfig,
                        sampleData)
                }
            });

        const compositeMapper = d => {
            const mapped = {}
            Object.entries(mappers).forEach(([visualVariable, mapper]) => {
                mapped[visualVariable] = mapper(d);
            });
            return mapped;
        };

        // Export for tooltips
        compositeMapper.mappers = mappers;

        return compositeMapper;
    }


    const createCompositeFilter = (
        /** @type {function(string):boolean} */inclusionPredicate
    ) => {
        // Trivial case
        if (!dataConfig.filters || dataConfig.filters.length <= 0) {
            return d => true;
        }

        const filterInstances = dataConfig.filters
            .filter(filter => inclusionPredicate(filter.field))
            .map(createFilter)

        return d => filterInstances.every(filter => filter(d));
    }


    const filterSharedVariables = createCompositeFilter(isShared);

    // Columns property was added by d3.dsv. Filter drops it. Have to add it back
    const columns = rows.columns;
    rows = rows.filter(filterSharedVariables);
    rows.columns = columns;

    const gatheredSamples = gather(rows, dataConfig.gather);

    const mapSharedVariables = createCompositeMapper(isShared, rows);

    // TODO: Maybe sampleData could be iterable
    const mapSampleVariables = gatheredSamples.size > 0 ?
        createCompositeMapper(x => !isShared(x), Array.prototype.concat.apply([], [...gatheredSamples.values()])) :
        x => ({});

    const filterSampleVariables = createCompositeFilter(x => !isShared(x));

    const sharedVariantVariables = rows
        .map(d => ({
            // TODO: 0 or 1 based addressing?
            // Add 0.5 to center the symbol inside nucleotide boundaries
            pos: cm.toContinuous(d[dataConfig.chrom], +d[dataConfig.pos]) + 0.5,
            ...mapSharedVariables(d)
        }));

    /**
     * @typedef {import('../gl/segmentsToVertices').PointSpec} PointSpec
     * @type {Map<string, PointSpec[]>}
     */
    const pointsBySample = new Map();

    for (const [sampleId, gatheredRows] of gatheredSamples) {
        /** @type {PointSpec[]} */
        const combined = [];

        for (let i = 0; i < sharedVariantVariables.length; i++) {
            const gathered = gatheredRows[i];
            if (filterSampleVariables(gathered)) {
                combined.push({
                    ...sharedVariantVariables[i],
                    ...mapSampleVariables(gathered),
                    rawDatum: rows[i]
                });
            }
        }

        if (combined.length) {
            pointsBySample.set(sampleId, combined);
        }
    }

    return pointsBySample;
}


/**
 * @param {Object[]} rows Data parsed with d3.dsv
 * @param {GatherConfig[]} gatherConfigs
 */
export function gather(rows, gatherConfigs) {
    // TODO: Support multiple fields 
    if (gatherConfigs.length > 1) {
        throw 'Currently only one field is supported in Gather configuration!';
    }
    const gatherConfig = gatherConfigs[0];
    
    const columnRegex = new RegExp(gatherConfig.columnRegex);

    /** @type {string} */
    const sampleColumns = rows.columns.filter(k => columnRegex.test(k));

    /** @type {Map<string, object>} */
    const gatheredFields = new Map();

    for (const sampleColumn of sampleColumns) {
        const sampleId = columnRegex.exec(sampleColumn)[1];

        const datums = rows.map(row => ({
            // TODO: Multiple fields 
            [gatherConfig.as]: row[sampleColumn]
        }));
        
        gatheredFields.set(sampleId, datums);
    }

    return gatheredFields;
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
            throw Error(`Unknown operator: ${filterConfig.operator}`);
     }
 }
