import { html } from "lit";

/**
 * Formats an attribute for compact menu text.
 *
 * @param {import("./types.js").AttributeInfo} attributeInfo
 * @returns {string | import("lit").TemplateResult}
 */
export function formatShortAttributeName(attributeInfo) {
    return attributeInfo.shortTitle
        ? html`<em class="attribute">${attributeInfo.shortTitle}</em>`
        : attributeInfo.emphasizedName;
}
