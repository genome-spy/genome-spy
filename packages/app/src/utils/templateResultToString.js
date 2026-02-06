import { render } from "lit";

/**
 * @param {string | import("lit").TemplateResult} templateResult
 * @returns {string}
 */
export default function templateResultToString(templateResult) {
    if (typeof document !== "undefined" && document.createElement) {
        const container = document.createElement("div");
        render(templateResult, container);
        return normalizeWhitespace(container.textContent ?? "");
    }

    return normalizeWhitespace(
        stripHtmlTags(stringifyTemplateValue(templateResult))
    );
}

/**
 * @param {any} value
 * @returns {string}
 */
function stringifyTemplateValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => stringifyTemplateValue(entry)).join("");
    }

    if (
        typeof value === "object" &&
        "strings" in value &&
        "values" in value &&
        Array.isArray(value.strings) &&
        Array.isArray(value.values)
    ) {
        let text = value.strings[0] ?? "";
        for (let i = 0; i < value.values.length; i++) {
            text +=
                stringifyTemplateValue(value.values[i]) +
                (value.strings[i + 1] ?? "");
        }
        return text;
    }

    if (
        typeof value === "object" &&
        Symbol.iterator in value &&
        typeof value[Symbol.iterator] === "function"
    ) {
        return Array.from(value, (entry) => stringifyTemplateValue(entry)).join(
            ""
        );
    }

    return "";
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripHtmlTags(text) {
    return text.replace(/<[^>]*>/g, "");
}
