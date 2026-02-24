import { html } from "lit";

/**
 * @param {string} version
 * @returns {import("lit").TemplateResult}
 */
export function renderVersionLink(version) {
    return html`<a
        href="https://github.com/genome-spy/genome-spy/releases/tag/v${version}"
        target="_blank"
        >v${version}</a
    >`;
}

export { default as packageJson } from "../../package.json" with { type: "json" };
