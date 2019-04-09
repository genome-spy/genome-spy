
// TODO: Sensible name for file, organization

import { extent } from 'd3-array';
import { color as d3color } from 'd3-color';

import { scaleLinear, scaleOrdinal, scaleSequential } from 'd3-scale';
import * as d3ScaleChromatic from 'd3-scale-chromatic';

import { inferNumeric } from '../utils/variableTools';

export const defaultOrdinalScheme = d3ScaleChromatic.schemeCategory10;
export const defaultSequentialInterpolator = d3ScaleChromatic.interpolateYlOrRd;

/**
 * @typedef {Object} ScaleConfig
 * @prop {number[] | string[]} [domain]
 * @prop {number[] | string[]} [range]
 * 
 * 
 * @typedef {Object} FieldEncodingConfig
 *    Defines how attributes (fields) are mapped to visual variables.
 * @prop {string} field A field of the data. An alternative to constant.
 * @prop {ScaleConfig} [scale]
 * @prop {String} [type]
 * 
 * 
 * @typedef {Object} ValueEncodingConfig
 * @prop {string | number} value A constant in the range. An alternative to field.
 * 
 * 
 * @typedef {Object} GenomicCoordinateEncodingConfig
 * @prop {string} chrom
 * @prop {string} pos
 * 
 * 
 * @typedef {FieldEncodingConfig | ValueEncodingConfig | GenomicCoordinateEncodingConfig} EncodingConfig
 * 
 */


const visualVariables = {
    x: { type: "number" },
    x2: { type: "number" },
    y: { type: "number" },
    y2: { type: "number" },
    color: { type: "color" },
    size: { type: "number" },
    opacity: { type: "number" }
};
 
/**
 * @param {FieldEncodingConfig | string} encodingConfig 
 * @returns {FieldEncodingConfig}
 */
function formalizeFieldEncodingConfig(encodingConfig) {
    if (typeof encodingConfig == "string") {
        return { 
            field: encodingConfig,
            scale: {}
        };
    }

    encodingConfig.scale = encodingConfig.scale || {};

    return encodingConfig;
}

/**
 * Creates a function that maps fields to visual variables
 * 
 * @param {string} targetType
 * @param {FieldEncodingConfig | string} encodingConfig 
 * @param {object[]} [sampleData] Sample data for inferring types and domains
 * @returns {function(object):any}
 */
export function createFieldEncodingMapper(targetType, encodingConfig, sampleData) {
    // TODO: Consider dynamic code generation:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function

    // TODO: Support constants

    encodingConfig = formalizeFieldEncodingConfig(encodingConfig);

    const scaleConfig = encodingConfig.scale;

    const accessor = d => d[/** @type {FieldEncodingConfig} */(encodingConfig).field]

    /** @type {function(any):any} */
    let mapper;

    let continuousDomain;

    if (targetType == "number") {
        continuousDomain = true;
        // TODO: Support domain and range and enforce ranges. For example, size must be within [0, 1]  
        // TODO: Infer domain from the sample data
        mapper = x => parseFloat(accessor(x));
        
    } else if (targetType == "color") {
        // Nominal or range types can be encoded as colors. Have to figure out which to use.

        let domain;
        if (scaleConfig.domain) {
            domain = scaleConfig.domain;
            continuousDomain = scaleConfig.domain.every(x => typeof x == "number");
            // TODO: Check length if numeric

        } else {
            if (!sampleData || sampleData.length <= 0) {
                throw `Can't infer domain for ${encodingConfig.field}. No sampleData provided!`
            }
            const samples = sampleData.map(accessor);
            continuousDomain = inferNumeric(samples);
            if (continuousDomain) {
                domain = extent(samples, parseFloat);

            } else {
                domain = [...new Set(samples).values()].sort();
            }
        }

        if (continuousDomain) {
            let scale ;

            if (scaleConfig.range) {
                // TODO: color "schemes"
                scale = scaleLinear().range(scaleConfig.range);

            } else {
                // TODO: Configurable interpolator
                scale = scaleSequential(defaultSequentialInterpolator);
            }

            scale.domain(/** @type {[number, number]} */(domain))
                .clamp(true);

            mapper = x => scale(parseFloat(accessor(x)));

        } else {
            // TODO: Custom range by name
            const scale = scaleOrdinal(
                /** @type {ReadonlyArray} */(scaleConfig.range) ||
                defaultOrdinalScheme
            )
                .domain(domain)
                .unknown("#e0e0e0");

            mapper = x => scale(accessor(x));
        }


    } else {
        throw `Unknown type: ${targetType}`;
        // TODO: Support nominal types for symbols etc
    }

    // TODO: Add tests:
    mapper.config = encodingConfig;
    mapper.continuous = continuousDomain;

    return mapper;
}

/**
 * 
 * @param {string} targetType 
 * @param {ValueEncodingConfig} encodingConfig 
 */
function createConstantValueMapper(targetType, encodingConfig) {
    const value = encodingConfig.value;

    if (targetType == "color") {
        const color = d3color(/** @type {any} */(value));
        if (!color) {
            throw new Error(`Not a proper color: ${value}`);
        }

        return () => color;

    } else if (targetType == "number") {
        const number = Number(value);
        if (isNaN(number)) {
            throw new Error(`Not a proper number: ${value}`);
        }

        return () => number;
    }
}

/**
 * 
 * @param {VisualMapperFactory} mapperFactory 
 * @param {Object[]} encodingConfigs 
 * @param {object[]} sampleData 
 */
export function createCompositeEncodingMapper(mapperFactory, encodingConfigs, sampleData) {

    const mappers = {};

    Object.entries(encodingConfigs || {})
        .forEach(([/** @type {string} */visualVariable, encodingConfig]) => {
            if (!visualVariables[visualVariable]) {
                throw Error(`Unknown visual variable "${visualVariable}" in ${JSON.stringify(encodingConfigs)}`);
            }

            const targetType = visualVariables[visualVariable].type;

            mappers[visualVariable] = mapperFactory.createMapper(targetType, encodingConfig, sampleData);

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

export class VisualMapperFactory {
    constructor() {
        /** @type {{ predicate: function, mapperCreator: function }[]} */
        this.mappers = [{
            predicate: encodingConfig => typeof encodingConfig.value != "undefined",
            mapperCreator: createConstantValueMapper
        }, {
            predicate: encodingConfig => typeof encodingConfig == "string" || typeof encodingConfig.field == "string",
            mapperCreator: createFieldEncodingMapper
        }];
    }

    registerMapper(predicatorAndCreator) {
        this.mappers.push(predicatorAndCreator);
    }

    findMapperCreator(encodingConfig) {
        const t = this.mappers.find(t => t.predicate(encodingConfig));
        if (t) {
            return t.mapperCreator;
        } else {
            throw new Error("Can not find a mapper for encoding config: " + JSON.stringify(encodingConfig));
        }
    }

    /**
     * Creates a function that maps data to visual variables
     * 
     * @param {string} targetType
     * @param {Object | string} encodingConfig 
     * @param {object[]} [sampleData] Sample data for inferring types and domains
     * @returns {function(object):any}
     */
    createMapper(targetType, encodingConfig, sampleData) {
        return this.findMapperCreator(encodingConfig)(targetType, encodingConfig, sampleData);
    }
}
