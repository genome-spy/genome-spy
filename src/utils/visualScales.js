
// TODO: Sensible name for file, organization

import { extent } from 'd3-array';
import { color } from 'd3-color';

import { scaleOrdinal, scaleSequential } from 'd3-scale';
import * as d3ScaleChromatic from 'd3-scale-chromatic';

import { inferNumeric } from './variableTools';

/**
 * @typedef {Object} GatherConfig
 * @prop {string} columnRegex
 * @prop {string} attribute
 * 
 * @typedef {Object} EncodingConfig
 *    Defines how attributes are mapped to visual variables.
 * @prop {string | number} [constant] A constant the range. An alternative to attribute.
 * @prop {string} [attribute] An attribute of the data. An alternative to constant.
 * @prop {number[] | string[]} [domain]
 * @prop {number[] | string[]} [range]
 * 
 * @typedef {Object} VariantDataConfig
 *    A configuration that specifies how data should be mapped
 *    to PointSpecs. The ultimate aim is to make this very generic
 *    and applicable to multiple types of data and visual encodings.
 * @prop {GatherConfig[]} gather
 * @prop {string} chrom
 * @prop {string} pos
 * @prop {Object} encodings TODO
 */

/**
 * @param {EncodingConfig | string} encodingConfig 
 * @returns {EncodingConfig}
 */
export function formalizeEncodingConfig(encodingConfig) {
    if (typeof encodingConfig == "string") {
        encodingConfig = { attribute: encodingConfig };
    }

    return encodingConfig;
}

export const defaultOrdinalScheme = d3ScaleChromatic.schemeCategory10;
export const defaultSequentialInterpolator = d3ScaleChromatic.interpolateYlOrRd;

/**
 * Creates a function that maps attributes to visual variables
 * 
 * @param {string} type
 * @param {EncodingConfig | string} encodingConfig 
 * @param {object[]} [sampleData] Sample data for inferring types and domains
 * @returns {function(object):any}
 */
export function createEncodingMapper(type, encodingConfig, sampleData) {
    // TODO: Consider dynamic code generation:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function

    // TODO: Support constants

    encodingConfig = formalizeEncodingConfig(encodingConfig);

    const accessor = d => d[/** @type {EncodingConfig} */(encodingConfig).attribute]

    let mapper;
    let numericDomain;

    if (type == "number") {
        numericDomain = true;
        // TODO: Support domain and range and enforce ranges. For example, size must be within [0, 1]  
        // TODO: Infer domain from the sample data
        mapper = x => parseFloat(accessor(x));
        
    } else if (type == "color") {
        // Nominal or range types can be encoded as colors. Have to figure out which to use.

        let domain;
        if (encodingConfig.domain) {
            domain = encodingConfig.domain;
            numericDomain = encodingConfig.domain.every(x => typeof x == "number");
            // TODO: Check length if numeric

        } else {
            if (!sampleData || sampleData.length <= 0) {
                throw `Can't infer domain for ${encodingConfig.attribute}. No sampleData provided!`
            }
            const samples = sampleData.map(accessor);
            numericDomain = inferNumeric(samples);
            if (numericDomain) {
                domain = extent(samples, parseFloat);

            } else {
                domain = [...new Set(samples).values()].sort();
            }
        }

        if (numericDomain) {
            // TODO: Configurable interpolator
            // TODO: Support custom interpolators as an array of colors
            const scale = scaleSequential(defaultSequentialInterpolator)
                .domain(/** @type {[number, number]} */(domain))
                .clamp(true);

            mapper = x => scale(parseFloat(accessor(x)));

        } else {
            // TODO: Custom range by name
            const scale = scaleOrdinal(
                /** @type {ReadonlyArray} */(encodingConfig.range) ||
                defaultOrdinalScheme
            )
                .domain(domain)
                .unknown("#e0e0e0");

            mapper = x => scale(accessor(x));
        }


    } else {
        throw `Unknown type: ${type}`;
        // TODO: Support nominal types for symbols etc
    }

    // TODO: Add tests:
    mapper.config = encodingConfig;
    mapper.numeric = numericDomain;

    return mapper;
}


/**
 * @param {Object[]} rows Data parsed with d3.dsv
 * @param {GatherConfig[]} gatherConfigs
 */
export function gather(rows, gatherConfigs) {
    // TODO: Support multiple attributes
    if (gatherConfigs.length > 1) {
        throw 'Currently only one attribute is supported in Gather configuration!';
    }
    const gatherConfig = gatherConfigs[0];
    
    const columnRegex = new RegExp(gatherConfig.columnRegex);

    /** @type {string} */
    const sampleColumns = rows.columns.filter(k => columnRegex.test(k));

    /** @type {Map<string, object>} */
    const gatheredAttributes = new Map();

    for (const sampleColumn of sampleColumns) {
        const sampleId = columnRegex.exec(sampleColumn)[1];

        const datums = rows.map(row => ({
            // TODO: Multiple attributes
            [gatherConfig.attribute]: row[sampleColumn]
        }));
        
        gatheredAttributes.set(sampleId, datums);
    }

    return gatheredAttributes;
}