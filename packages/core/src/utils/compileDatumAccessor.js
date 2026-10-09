import { annotateSpecError } from "./specError.js";

let nextAccessorId = 0;

/**
 * Compiles a factory with literal field checks and direct datum accesses.
 * Independent compilations have unique source so engines cannot reuse feedback
 * across accessors for unrelated data sources with the same field names.
 *
 * @param {string} body
 * @param {Iterable<string>} fields Top-level properties required on every row.
 * @param {import("../types/embedApi.js").SpecLocation} [location]
 * @param {object} [context] Expression helper context used as `this`.
 * @returns {(globalObject?: Record<string, any>) => (datum?: import("../data/flowNode.js").Datum) => any}
 */
export default function compileDatumAccessor(body, fields, location, context) {
    const checks = Array.from(fields, (field) => {
        const key = JSON.stringify(field);
        return `if (!(${key} in datum)) missingField(datum, ${key});`;
    }).join("\n");

    return Function(
        "missingField",
        "context",
        `"use strict";
        return function createAccessor(globalObject) {
            // accessor ${nextAccessorId++}
            return function accessDatum(datum) {
                ${checks}
                ${body}
            }${context ? ".bind(context)" : ""};
        };`
    )((/** @type {object} */ datum, /** @type {string} */ field) => {
        throw annotateSpecError(
            new Error(
                `Invalid field "${field}". Available fields or properties: ${Object.keys(datum).join(", ")}`
            ),
            location
        );
    }, context);
}
