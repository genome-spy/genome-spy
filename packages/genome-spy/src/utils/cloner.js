/**
 * Creates a shallow-cloner function that ensures (hopefully) that the properties
 * end up into the in-object storage. Offers better performance than Object.assign
 * and saves memory.
 *
 * Read more at:
 * https://mrale.ph/blog/2014/07/30/constructor-vs-objectcreate.html
 *
 * @param {T} template The template object that
 * @returns {function(T):T}
 * @template T
 */
export default function createCloner(template) {
    // TODO: Check that only properties, not methods get cloned
    const properties = Object.keys(template);

    const cloner = /** @type {function(T):T} */ (
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
