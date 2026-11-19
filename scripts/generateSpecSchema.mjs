import { Buffer } from "node:buffer";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

/** @typedef {import("ts-json-schema-generator").Schema} Schema */
/** @typedef {Schema | boolean} Subschema */

const draft7 = "http://json-schema.org/draft-07/schema#";
const sharedPrefix = "shared-";

// Leave small schemas inline. Sharing adds a definition key and a ref at
// each site, and short inline schemas already compress well.
const minSharedBytes = 120;

const schemaSources = {
    core: ["../packages/core/src/spec/*.ts", "CoreRootSpec"],
    app: ["../packages/app/src/spec/*.d.ts", "AppRootSpec"],
};

/**
 * @param {keyof schemaSources} target
 * @param {{skipTypeCheck?: boolean}} [options]
 * @returns {Schema}
 */
export function generateSpecSchema(target, { skipTypeCheck = false } = {}) {
    const [source, type] = schemaSources[target];
    const schema = createGenerator({
        path: fileURLToPath(new URL(source, import.meta.url)),
        tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
        type,
        skipTypeCheck,
    }).createSchema(type);

    // Match the TypeScript generator CLI's property order. The docs render
    // properties in this order, and it makes identical nodes serialize alike.
    return deduplicateSpecSchema(JSON.parse(JSON.stringify(schema, sortKeys)));
}

/**
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeys(_key, value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    const record = /** @type {Record<string, unknown>} */ (value);
    return Object.fromEntries(
        Object.keys(record)
            .sort()
            .map((key) => [key, record[key]])
    );
}

/**
 * @param {Schema} schema
 * @param {(child: Subschema, isDefinition?: boolean) => Subschema} transform
 * @returns {Schema}
 */
function mapSubschemas(schema, transform) {
    const result = { ...schema };

    for (const key of /** @type {const} */ ([
        "definitions",
        "properties",
        "patternProperties",
        "dependencies",
    ])) {
        const entries = schema[key];
        if (entries) {
            Object.assign(result, {
                [key]: Object.fromEntries(
                    Object.entries(entries).map(([name, child]) => [
                        name,
                        Array.isArray(child)
                            ? child
                            : transform(child, key === "definitions"),
                    ])
                ),
            });
        }
    }

    for (const key of /** @type {const} */ (["allOf", "anyOf", "oneOf"])) {
        if (schema[key]) {
            result[key] = schema[key].map((child) => transform(child));
        }
    }

    if (schema.items !== undefined) {
        result.items = Array.isArray(schema.items)
            ? schema.items.map((child) => transform(child))
            : transform(schema.items);
    }

    for (const key of /** @type {const} */ ([
        "additionalItems",
        "additionalProperties",
        "contains",
        "propertyNames",
        "if",
        "then",
        "else",
        "not",
    ])) {
        if (schema[key] !== undefined) {
            result[key] = transform(schema[key]);
        }
    }

    return result;
}

/**
 * Share identical Draft 7 subschemas within one document. Moving a schema
 * requires a single base URI and references to the root definitions only.
 * @param {Schema} schema
 * @returns {Schema}
 */
export function deduplicateSpecSchema(schema) {
    const { definitions } = schema;
    if (
        schema.$schema !== draft7 ||
        !definitions ||
        !referencesRoot(schema.$ref)
    ) {
        return schema;
    }

    /** @type {Map<string, number>} */
    const counts = new Map();

    /** @type {Map<string, Schema>} */
    const refs = new Map();

    /** @type {NonNullable<Schema["definitions"]>} */
    const shared = {};
    let next = 0;
    let supported = true;

    /**
     * @param {string} [ref]
     * @returns {boolean}
     */
    function referencesRoot(ref) {
        if (ref === undefined) {
            return true;
        }

        const match = /^#\/definitions\/([^/]+)$/.exec(decodeURIComponent(ref));
        return (
            match !== null &&
            Object.hasOwn(
                definitions,
                match[1].replaceAll("~1", "/").replaceAll("~0", "~")
            )
        );
    }

    /**
     * @param {Subschema} child
     * @param {boolean} [isDefinition]
     * @returns {Subschema}
     */
    function count(child, isDefinition) {
        if (typeof child === "boolean" || !supported) {
            return child;
        }
        if (
            child.$id !== undefined ||
            child.$schema !== undefined ||
            !referencesRoot(child.$ref)
        ) {
            supported = false;
            return child;
        }

        if (!isDefinition) {
            const key = JSON.stringify(child);
            if (Buffer.byteLength(key) >= minSharedBytes) {
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        mapSubschemas(child, count);
        return child;
    }

    /**
     * @param {Subschema} child
     * @param {boolean} [isDefinition]
     * @returns {Subschema}
     */
    function share(child, isDefinition) {
        if (typeof child === "boolean") {
            return child;
        }
        if (isDefinition) {
            return mapSubschemas(child, share);
        }

        const key = JSON.stringify(child);
        if ((counts.get(key) ?? 0) < 2) {
            return mapSubschemas(child, share);
        }
        const existing = refs.get(key);
        if (existing) {
            return existing;
        }

        let name;
        do {
            name = sharedPrefix + next++;
        } while (Object.hasOwn(definitions, name));

        const ref = { $ref: "#/definitions/" + name };
        refs.set(key, ref);
        shared[name] = mapSubschemas(child, share);
        return ref;
    }

    mapSubschemas(schema, count);
    if (!supported) {
        return schema;
    }

    const result = mapSubschemas(schema, share);
    Object.assign(result.definitions, shared);

    // Hoisting a parent can reduce the number of uses of its descendants.
    return Buffer.byteLength(JSON.stringify(result)) <
        Buffer.byteLength(JSON.stringify(schema))
        ? result
        : schema;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const target = process.argv[2];
    if (target !== "core" && target !== "app") {
        throw new Error("Expected a schema target of core or app.");
    }
    process.stdout.write(
        JSON.stringify(generateSpecSchema(target), null, 2) + "\n"
    );
}
