import { render } from "lit";

/**
 * @param {string | import("lit").TemplateResult} templateResult
 * @returns {string}
 */
export default function templateResultToString(templateResult) {
    const container = document.createElement("div");
    render(templateResult, container);
    return container.textContent ?? "";
}
