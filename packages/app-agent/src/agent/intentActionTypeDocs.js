// @ts-check
import { getAgentActionSchemaDefinitions } from "./agentActionSchema.js";
import {
    docsOnlyTypeSummaries,
    resolveDisplayTypeExpression,
    typeExamples,
    typeNotes,
} from "./intentActionDisplayTypes.js";

const definitionRefPrefix = "#/definitions/";

/**
 * @param {{ typeName: string; referenceDepth?: 0 | 1 }} input
 */
export function getIntentActionTypeDocs(input) {
    const definitions = getAgentActionSchemaDefinitions();
    const resolved = resolveDisplayTypeExpression(input.typeName, definitions);
    const referenceDepth = input.referenceDepth ?? 1;
    const referencedTypes = listReferencedTypes(resolved.schema);
    const normalizedTypeName = resolved.normalizedTypeName ?? input.typeName;
    const notes = dedupeStrings([
        ...(typeNotes[input.typeName] ?? []),
        ...(typeNotes[normalizedTypeName] ?? []),
        ...(resolved.notes ?? []),
    ]);
    const examples = collectExamples(normalizedTypeName, referencedTypes);

    return {
        typeName: input.typeName,
        ...(resolved.normalizedTypeName
            ? { normalizedTypeName: resolved.normalizedTypeName }
            : {}),
        ...(resolved.schema.description
            ? { description: resolved.schema.description }
            : {}),
        schema: cloneJson(resolved.schema),
        ...(referenceDepth > 0
            ? {
                  definitions: collectReferencedDefinitions(
                      referencedTypes,
                      definitions
                  ),
              }
            : {}),
        referencedTypes,
        ...(examples.length ? { examples } : {}),
        ...(notes.length ? { notes } : {}),
    };
}

/**
 * @param {string[]} typeNames
 * @param {Record<string, any>} definitions
 * @returns {Record<string, any>}
 */
function collectReferencedDefinitions(typeNames, definitions) {
    /** @type {Record<string, any>} */
    const result = {};
    const queue = [...typeNames];
    const visited = new Set();

    while (queue.length) {
        const typeName = /** @type {string} */ (queue.shift());
        if (visited.has(typeName)) {
            continue;
        }
        visited.add(typeName);

        const definition = getDocsDefinition(typeName, definitions);
        if (!definition) {
            continue;
        }

        result[typeName] = cloneJson(definition);
        for (const referencedType of listReferencedTypes(definition)) {
            if (!visited.has(referencedType)) {
                queue.push(referencedType);
            }
        }
    }

    return result;
}

/**
 * @param {string} typeName
 * @param {Record<string, any>} definitions
 * @returns {Record<string, any> | undefined}
 */
function getDocsDefinition(typeName, definitions) {
    return docsOnlyTypeSummaries[typeName]?.schema ?? definitions[typeName];
}

/**
 * @param {unknown} schema
 * @returns {string[]}
 */
function listReferencedTypes(schema) {
    const result = new Set();
    visit(schema, result);
    return Array.from(result);
}

/**
 * @param {unknown} value
 * @param {Set<string>} refs
 */
function visit(value, refs) {
    if (value === null || typeof value !== "object") {
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            visit(item, refs);
        }
        return;
    }

    const object = /** @type {Record<string, any>} */ (value);
    if (
        typeof object.$ref === "string" &&
        object.$ref.startsWith(definitionRefPrefix)
    ) {
        refs.add(object.$ref.slice(definitionRefPrefix.length));
    }

    for (const child of Object.values(object)) {
        visit(child, refs);
    }
}

/**
 * @param {string} normalizedTypeName
 * @param {string[]} referencedTypes
 * @returns {unknown[]}
 */
function collectExamples(normalizedTypeName, referencedTypes) {
    /** @type {unknown[]} */
    const examples = [];
    for (const typeName of [normalizedTypeName, ...referencedTypes]) {
        examples.push(...(typeExamples[typeName] ?? []));
    }

    return dedupeJson(examples);
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function dedupeStrings(values) {
    return Array.from(new Set(values));
}

/**
 * @param {unknown[]} values
 * @returns {unknown[]}
 */
function dedupeJson(values) {
    const seen = new Set();
    return values.filter((value) => {
        const key = JSON.stringify(value);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
