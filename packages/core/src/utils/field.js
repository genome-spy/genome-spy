import { accessor, splitAccessPath } from "vega-util";
import compileDatumAccessor from "./compileDatumAccessor.js";

/**
 * Compiles a field path into literal property accesses, with Vega-compatible
 * accessor metadata. Only single-property paths receive presence validation.
 *
 * @param {string} fieldExpr
 * @param {string} [name]
 * @param {import("../types/embedApi.js").SpecLocation} [location]
 */
export function field(fieldExpr, name, location) {
    const path = splitAccessPath(fieldExpr);
    const fieldName = path.length === 1 ? path[0] : fieldExpr;
    const access = path.map((part) => `[${JSON.stringify(part)}]`).join("");
    const fn = compileDatumAccessor(
        `return datum${access};`,
        path.length === 1 ? path : [],
        location
    )();
    return accessor(fn, [fieldName], name ?? fieldName);
}
