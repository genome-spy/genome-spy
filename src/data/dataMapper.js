
import { createCompositeEncodingMapper } from './visualEncoders';
import transformers from './transforms/transforms';

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
 * @param {object} [baseObject] prototype for specs. Allows setting constants etc
 * @returns {object[]}
 */
export function processData(encodingConfigs, rows, mapperFactory, baseObject) {

    // TODO: Validate that data contains all fields that are referenced in the config.
    // ... just to prevent mysterious undefineds

    const encode = createCompositeEncodingMapper(mapperFactory, encodingConfigs, rows, baseObject);

    const specs = rows.map(d => {
        const encoded = encode(d);
        encoded.rawDatum = d;
        return encoded;
    });


    const fieldMappers = [];
    for (const mapper of Object.values(encode.mappers)) {
        if (mapper.config && mapper.config.field) {
            fieldMappers[mapper.config.field] = mapper;
        }
    }

    // For tooltips
    specs.fieldMappers = fieldMappers;

    return specs;
}
