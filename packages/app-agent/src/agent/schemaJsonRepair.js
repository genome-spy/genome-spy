// @ts-check

/**
 * Parses JSON-encoded object strings at positions where the schema expects an
 * object. This repairs a narrow class of tool-call serialization mistakes
 * without changing string fields that legitimately accept strings.
 *
 * @param {unknown} value
 * @param {Record<string, any>} schema
 * @param {Record<string, any>} definitions
 * @returns {unknown}
 */
export function repairJsonEncodedObjects(value, schema, definitions) {
    return repairValue(value, schema, definitions, new Set());
}

/**
 * @param {unknown} value
 * @param {Record<string, any>} schema
 * @param {Record<string, any>} definitions
 * @param {Set<string>} resolvingRefs
 * @returns {unknown}
 */
function repairValue(value, schema, definitions, resolvingRefs) {
    const resolvedSchema = resolveSchema(schema, definitions, resolvingRefs);
    if (!resolvedSchema) {
        return value;
    }

    if (
        typeof value === "string" &&
        expectsObject(resolvedSchema, definitions, resolvingRefs)
    ) {
        const parsed = parseObjectString(value);
        if (parsed) {
            return repairValue(
                parsed,
                resolvedSchema,
                definitions,
                resolvingRefs
            );
        }
    }

    if (Array.isArray(value)) {
        const itemSchema = resolvedSchema.items;
        if (!itemSchema) {
            return value;
        }

        for (const [index, item] of value.entries()) {
            value[index] = repairValue(
                item,
                itemSchema,
                definitions,
                resolvingRefs
            );
        }
        return value;
    }

    if (!isObject(value)) {
        return value;
    }

    const branchSchemas = getBranchSchemas(resolvedSchema);
    if (branchSchemas.length) {
        for (const branchSchema of branchSchemas) {
            repairValue(value, branchSchema, definitions, resolvingRefs);
        }
    }

    const properties = /** @type {Record<string, any> | undefined} */ (
        resolvedSchema.properties
    );
    if (!properties) {
        return value;
    }

    for (const [property, propertySchema] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(value, property)) {
            value[property] = repairValue(
                value[property],
                propertySchema,
                definitions,
                resolvingRefs
            );
        }
    }

    return value;
}

/**
 * @param {Record<string, any>} schema
 * @param {Record<string, any>} definitions
 * @param {Set<string>} resolvingRefs
 * @returns {Record<string, any> | undefined}
 */
function resolveSchema(schema, definitions, resolvingRefs) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return undefined;
    }

    if (typeof schema.$ref !== "string") {
        return schema;
    }

    const prefix = "#/definitions/";
    if (!schema.$ref.startsWith(prefix)) {
        return schema;
    }

    const definitionName = schema.$ref.slice(prefix.length);
    if (resolvingRefs.has(definitionName)) {
        return undefined;
    }

    const definition = definitions[definitionName];
    if (!definition) {
        return undefined;
    }

    resolvingRefs.add(definitionName);
    const resolved = resolveSchema(definition, definitions, resolvingRefs);
    resolvingRefs.delete(definitionName);
    return resolved;
}

/**
 * @param {Record<string, any>} schema
 * @param {Record<string, any>} definitions
 * @param {Set<string>} resolvingRefs
 * @returns {boolean}
 */
function expectsObject(schema, definitions, resolvingRefs) {
    const resolvedSchema = resolveSchema(schema, definitions, resolvingRefs);
    if (!resolvedSchema) {
        return false;
    }

    if (resolvedSchema.type === "object" || resolvedSchema.properties) {
        return true;
    }

    return getBranchSchemas(resolvedSchema).some((branchSchema) =>
        expectsObject(branchSchema, definitions, resolvingRefs)
    );
}

/**
 * @param {Record<string, any>} schema
 * @returns {Record<string, any>[]}
 */
function getBranchSchemas(schema) {
    return ["anyOf", "oneOf", "allOf"].flatMap((key) => {
        const branches = schema[key];
        return Array.isArray(branches) ? branches : [];
    });
}

/**
 * @param {string} value
 * @returns {Record<string, any> | undefined}
 */
function parseObjectString(value) {
    try {
        const parsed = JSON.parse(value);
        return isObject(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
