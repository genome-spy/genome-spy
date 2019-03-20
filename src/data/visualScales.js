
// TODO: Sensible name for file, organization

import { extent } from 'd3-array';
import { color } from 'd3-color';

import { scaleOrdinal, scaleSequential } from 'd3-scale';
import * as d3ScaleChromatic from 'd3-scale-chromatic';

import { inferNumeric } from '../utils/variableTools';

export const defaultOrdinalScheme = d3ScaleChromatic.schemeCategory10;
export const defaultSequentialInterpolator = d3ScaleChromatic.interpolateYlOrRd;

/**
 * @typedef {Object} EncodingConfig
 *    Defines how attributes (fields) are mapped to visual variables.
 * @prop {string} [field] A field of the data. An alternative to constant.
 * @prop {string | number} [value] A constant in the range. An alternative to field.
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
 * @prop {Object} encodings 
 * @prop {SimpleFilterConfig[]} filters
 */

 
/**
 * @param {EncodingConfig | string} encodingConfig 
 * @returns {EncodingConfig}
 */
export function formalizeEncodingConfig(encodingConfig) {
    if (typeof encodingConfig == "string") {
        encodingConfig = { field: encodingConfig };
    }

    return encodingConfig;
}

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

    const accessor = d => d[/** @type {EncodingConfig} */(encodingConfig).field]

    /** @type {function(any):any} */
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
                throw `Can't infer domain for ${encodingConfig.field}. No sampleData provided!`
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
 * 
 * @param {EncodingConfig[]} encodingConfigs 
 * @param {object} visualVariables
 * @param {object[]} sampleData 
 */
export function createCompositeEncodingMapper(encodingConfigs, visualVariables, sampleData) {
    const mappers = {};

    Object.entries(encodingConfigs || {})
        .forEach(([/** @type {string} */visualVariable, /** @type {EncodingConfig} */encodingConfig]) => {
            if (!visualVariables[visualVariable]) {
                throw Error(`Unknown visual variable: ${visualVariable}`);
            }

            encodingConfig = formalizeEncodingConfig(encodingConfig);

            mappers[visualVariable] = createEncodingMapper(
                visualVariables[visualVariable].type,
                encodingConfig,
                sampleData)
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

