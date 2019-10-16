
import { parse, codegen } from 'vega-expression';

/**
 * @typedef {import("../../spec/transform").FilterConfig} FilterConfig
 */

/**
 * 
 * @param {FilterConfig} filterConfig 
 * @param {Object[]} rows 
 */
export default function filterTransform(filterConfig, rows) {
    const cg = codegen({
        blacklist: [],
        whitelist: ["datum"],
        globalvar: "global",
        fieldvar: "datum"
    });

    const parsed = parse(filterConfig.expr);
    const generatedCode = cg(parsed);

    const global = { };

    // eslint-disable-next-line no-new-func
    const fn = Function("datum", "global", `"use strict"; return (${generatedCode.code});`);

    return rows.filter(row => fn(row, global));
}