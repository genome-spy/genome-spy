/**
 * Returns key fields used for point selections, if configured.
 *
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {string[] | undefined}
 */
export function getEncodingKeyFields(encoding) {
    return getNormalizedFieldsFromChannel(encoding?.key, "key");
}

/**
 * Returns search fields configured in encoding.search, if any.
 *
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {string[] | undefined}
 */
export function getEncodingSearchFields(encoding) {
    return getNormalizedFieldsFromChannel(encoding?.search, "search");
}

/**
 * @param {import("../spec/channel.js").FieldDefWithoutScale | import("../spec/channel.js").FieldDefWithoutScale[] | undefined} channelDef
 * @param {"key" | "search"} channelName
 * @returns {string[] | undefined}
 */
function getNormalizedFieldsFromChannel(channelDef, channelName) {
    if (!channelDef) {
        return;
    }

    const definitions = Array.isArray(channelDef) ? channelDef : [channelDef];
    if (definitions.length === 0) {
        throw new Error(
            "The " + channelName + " channel array must not be empty."
        );
    }

    /** @type {string[]} */
    const fields = [];
    for (const definition of definitions) {
        if (
            !definition ||
            typeof definition !== "object" ||
            !("field" in definition)
        ) {
            throw new Error(
                "The " +
                    channelName +
                    " channel must be a field definition or an array of field definitions."
            );
        }

        const fieldName = definition.field;
        if (typeof fieldName !== "string") {
            throw new Error(
                "The " +
                    channelName +
                    " channel field definition must include a string field name."
            );
        }
        fields.push(fieldName);
    }

    return fields;
}
