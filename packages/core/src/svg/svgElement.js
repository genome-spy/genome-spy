const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @template {keyof SVGElementTagNameMap} K
 * @param {K} name
 * @param {Record<string, string | number>} [attributes]
 * @returns {SVGElementTagNameMap[K]}
 */
export function createSvgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
            element.setAttribute(key, "" + value);
        }
    }
    return element;
}

export { SVG_NS };
