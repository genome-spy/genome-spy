/**
 * @typedef {import("./types.js").AttributeIdentifier} AttributeIdentifier
 * @typedef {((identifier: AttributeIdentifier) => import("./types.js").AttributeInfo)} AttributeInfoSource
 */

/**
 * TODO: Make this a function instead of a class
 */
export default class CompositeAttributeInfoSource {
    constructor() {
        /**
         * @type {Record<string, AttributeInfoSource>}
         */
        this.attributeInfoSourcesByType = {};
    }

    /**
     *
     * @param {string} type
     * @param {AttributeInfoSource} attributeInfoSource
     */
    addAttributeInfoSource(type, attributeInfoSource) {
        this.attributeInfoSourcesByType[type] = attributeInfoSource;
    }

    /**
     * @param {string} type
     * @param {AttributeInfoSource} [attributeInfoSource]
     */
    removeAttributeInfoSource(type, attributeInfoSource) {
        if (
            attributeInfoSource &&
            this.attributeInfoSourcesByType[type] !== attributeInfoSource
        ) {
            return;
        }

        delete this.attributeInfoSourcesByType[type];
    }

    /**
     *
     * @param {AttributeIdentifier} attribute
     */
    getAttributeInfo(attribute) {
        const source = this.attributeInfoSourcesByType[attribute.type];
        if (!source) {
            throw new Error(
                "Cannot find attribute info source for: " +
                    JSON.stringify(attribute)
            );
        }

        const info = source(attribute);
        if (info) {
            return info;
        }

        throw new Error("Unknown attribute: " + JSON.stringify(attribute));
    }
}
