/**
 * @param {string} instancePath
 * @returns {string}
 */
function formatPath(instancePath) {
    if (!instancePath) {
        return "$";
    }

    const parts = instancePath.split("/").slice(1);
    let path = "$";
    for (const part of parts) {
        const segment = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (/^\d+$/.test(segment)) {
            path += "[" + segment + "]";
        } else {
            path += "." + segment;
        }
    }

    return path;
}

/**
 * Formats AJV validation errors into readable messages.
 *
 * @param {string} prefix
 * @param {import("ajv").ErrorObject[] | null | undefined} errors
 * @returns {string[]}
 */
export function formatAjvErrors(prefix, errors) {
    if (!errors) {
        return [];
    }

    /** @type {string[]} */
    const messages = [];

    for (const error of errors) {
        const path = formatPath(error.instancePath);
        const fullPath = path === "$" ? prefix : prefix + path.slice(1);

        if (error.keyword === "required") {
            messages.push(
                fullPath + "." + error.params.missingProperty + " is required."
            );
        } else if (error.keyword === "additionalProperties") {
            messages.push(
                fullPath +
                    " has unexpected property " +
                    error.params.additionalProperty +
                    "."
            );
        } else if (error.keyword === "type") {
            messages.push(
                fullPath + " must be of type " + error.params.type + "."
            );
        } else if (error.keyword === "enum") {
            messages.push(
                fullPath +
                    " must be one of " +
                    error.params.allowedValues
                        .map((/** @type {unknown} */ value) =>
                            JSON.stringify(value)
                        )
                        .join(", ") +
                    "."
            );
        } else if (error.keyword === "const") {
            messages.push(
                fullPath +
                    " must equal " +
                    JSON.stringify(error.params.allowedValue) +
                    "."
            );
        } else if (error.keyword === "minimum") {
            messages.push(
                fullPath +
                    " must be greater than or equal to " +
                    error.params.limit +
                    "."
            );
        } else if (error.keyword === "exclusiveMinimum") {
            messages.push(
                fullPath + " must be greater than " + error.params.limit + "."
            );
        } else if (error.keyword === "minItems") {
            messages.push(
                fullPath +
                    " must contain at least " +
                    error.params.limit +
                    " item(s)."
            );
        } else if (error.keyword === "maxItems") {
            messages.push(
                fullPath +
                    " must contain at most " +
                    error.params.limit +
                    " item(s)."
            );
        } else if (error.keyword === "anyOf" || error.keyword === "oneOf") {
            messages.push(fullPath + " must match a schema variant.");
        } else {
            messages.push(fullPath + " " + error.message + ".");
        }
    }

    return messages;
}
