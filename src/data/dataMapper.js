
import transformers from './transforms/transforms';

/**
 * 
 * @param {object[]} transformConfigs 
 * @param {import("group").Group} data
 */
export function transformData(transformConfigs, data) {
    for (const transformConfig of transformConfigs) {
        const type = transformConfig.type;
        if (!type) {
            throw new Error("Type not defined in transformConfig!");

        } else if (type == "ungroup") {
            // Special case hack
            // TODO: implement "as", put the group key into a new field
            data = data.ungroup();

        } else {
            const transformer = transformers[type];
            if (!transformer) {
                throw new Error(`Unknown transformer type: ${type}`);
            }

            data = data.map(rows => transformer(transformConfig, rows))
        }
    }

    return data;
}
