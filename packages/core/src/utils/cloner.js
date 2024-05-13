/**
 * Creates a shallow-cloner function that ensures (hopefully) that the properties
 * end up into the in-object storage. Offers better performance than Object.assign
 * and saves memory.
 *
 * Read more at:
 * https://mrale.ph/blog/2014/07/30/constructor-vs-objectcreate.html
 *
 * @param {T} template The template object that
 * @returns {(function(T):T) & { properties: string[] }}
 * @template {object} [T=object]
 */
export default function createCloner(template) {
    // TODO: Check that only properties, not methods get cloned
    const properties = /** @type {string[]} */ (
        getAllProperties(template).filter((k) => typeof k == "string")
    );

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
