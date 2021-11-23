import snarkdown from "snarkdown";

/**
 * Adapted from: https://github.com/developit/snarkdown/issues/70#issuecomment-626863373
 *
 * @param {string} markdown
 */
export default function safeMarkdown(markdown) {
    const html = snarkdown(markdown);
    const doc = new DOMParser().parseFromString(
        `<!DOCTYPE html><html><body><div>${html}</div></body></html>`,
        "text/html"
    );
    doc.normalize();
    sanitize(doc.body);
    const elem = doc.body.removeChild(doc.querySelector("body > div"));
    elem.className = "snarkdown";

    return /** @type {HTMLElement} */ (elem);
}

/**
 * @param {HTMLElement} node
 */
function sanitize(node) {
    if (node.nodeType === 3) {
        return;
    }

    if (
        node.nodeType !== 1 ||
        /^(script|iframe|object|embed|svg)$/i.test(node.tagName)
    ) {
        return node.remove();
    }
    for (let i = node.attributes.length; i--; ) {
        const name = node.attributes[i].name;
        if (
            !/^(class|id|name|href|src|alt|align|valign|(on[a-z]+))$/i.test(
                name
            )
        ) {
            node.attributes.removeNamedItem(name);
        }
    }
    for (let i = node.childNodes.length; i--; ) {
        // @ts-ignore
        sanitize(node.childNodes[i]);
    }
}
