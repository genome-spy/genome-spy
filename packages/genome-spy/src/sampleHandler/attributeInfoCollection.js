/**
 * @typedef {import("./types").AttributeIdentifier} AttributeIdentifier
 * @typedef {((identifier: AttributeIdentifier) => import("./types").AttributeInfo)} AttributeInfoSource
 */

/**
 *
 */
export default class AttributeInfoCollection {
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
