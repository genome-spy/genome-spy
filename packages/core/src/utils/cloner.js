/**
 * Creates a shallow-cloner function that ensures (hopefully) that the properties
 * end up into the in-object storage. Offers better performance than Object.assign
 * and saves memory.
 *
 * Read more at:
 * https://mrale.ph/blog/2014/07/30/constructor-vs-objectcreate.html
 *
 * @param {T} template The template object that
 * @param {{ copyFields?: Iterable<string> }} [options]
 * @returns {(function(T):T) & { properties: string[] }}
 * @template {object} [T=object]
 */
export default function createCloner(template, options = {}) {
    const copyFields = options.copyFields
        ? new Set(options.copyFields)
        : undefined;

    // TODO: Check that only properties, not methods get cloned
    const properties = getCloneProperties(template, copyFields);

    return createClonerForProperties(properties);
}

/**
 * Creates a cloner from the first datum and reuses it until reset. Data
 * sources and transforms must keep a stable input object shape within a batch.
 *
 * @param {{ copyFields?: Iterable<string> }} [options]
 * @returns {((datum: import("../data/flowNode.js").Datum) => import("../data/flowNode.js").Datum) & { reset: () => void }}
 */
export function createCachedCloner(options = {}) {
    const copyFields = options.copyFields
        ? new Set(options.copyFields)
        : undefined;

    /** @type {((datum: import("../data/flowNode.js").Datum) => import("../data/flowNode.js").Datum) | undefined} */
    let clone;

    const cachedCloner = /** @type {ReturnType<typeof createCachedCloner>} */ (
        (datum) => {
            if (!clone) {
                const properties = getCloneProperties(datum, copyFields);
                clone = createClonerForProperties(properties);
            }

            return clone(datum);
        }
    );

    cachedCloner.reset = () => {
        clone = undefined;
    };

    return cachedCloner;
}

/**
 * @param {string[]} properties
 * @returns {(function(T):T) & { properties: string[] }}
 * @template {object} [T=object]
 */
function createClonerForProperties(properties) {
    const cloner = /** @type {(function(T):T) & { properties: string[] }} */ (
        new Function(
            "source",
            "return { " +
                properties
                    .map((prop) => JSON.stringify(prop))
                    .map((prop) => `${prop}: source[${prop}]`)
                    .join(",\n") +
                " };"
        )
    );

    cloner.properties = properties;

    return cloner;
}

/**
 * @param {object} template
 * @param {Set<string> | undefined} copyFields
 */
function getCloneProperties(template, copyFields) {
    return /** @type {string[]} */ (
        getAllProperties(template).filter(
            (k) => typeof k == "string" && (!copyFields || copyFields.has(k))
        )
    );
}

/**
 * Needed for proxied Apache Arrow tables.
 *
 * @param {object} obj
 */
export function getAllProperties(obj) {
    /** @type {string[]} */
    let props = [];
    do {
        props = props.concat(Object.keys(obj));
        obj = Object.getPrototypeOf(obj);
    } while (obj && obj !== Object.prototype); // Traverse until the end of the prototype chain

    const uniqueProps = Array.from(new Set(props));
    return uniqueProps;
}
