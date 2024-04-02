import { micromark } from "micromark";
import addBaseUrl from "@genome-spy/core/utils/addBaseUrl.js";

/**
 * @typedef {object} SafeMarkdownOptions
 * @prop {string} [baseUrl] Base URL for relative URLs
 */

/**
 * Adapted from: https://github.com/developit/snarkdown/issues/70#issuecomment-626863373
 *
 * @param {string} markdown
 * @param {SafeMarkdownOptions} [options]
 */
export default function safeMarkdown(markdown, options = {}) {
    const html = micromark(markdown);

    const doc = new DOMParser().parseFromString(
        `<!DOCTYPE html><html><body><div>${html}</div></body></html>`,
        "text/html"
    );
    doc.normalize();
    sanitize(doc.body);

    for (const a of doc.querySelectorAll("a[href]")) {
        a.setAttribute("target", "blank");
        a.setAttribute("rel", "noopener noreferrer");
        a.setAttribute(
            "href",
            addBaseUrl(a.getAttribute("href"), options.baseUrl)
        );
    }

    for (const img of doc.querySelectorAll("img[src]")) {
        img.setAttribute(
            "src",
            addBaseUrl(img.getAttribute("src"), options.baseUrl)
        );
    }

    const elem = doc.body.removeChild(doc.querySelector("body > div"));
    elem.className = "markdown";

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
