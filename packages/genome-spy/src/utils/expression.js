
import { parse, codegen } from 'vega-expression';

/**
 * 
 * @param {string} expr 
 */
export default function createFunction(expr, global = {}) {
    const cg = codegen({
        blacklist: [],
        whitelist: ["datum"],
        globalvar: "global",
        fieldvar: "datum"
    });

    try {
        const parsed = parse(expr);
        const generatedCode = cg(parsed);

        // eslint-disable-next-line no-new-func
        const fn = Function("datum", "global", `"use strict"; return (${generatedCode.code});`);
        

        const fun = /** @param {object} x */ x => fn(x, global);
        fun.fields = generatedCode.fields;
        return fun;

    } catch (e) {
        throw new Error(`Invalid expression: ${expr}, ${e.message}`);
    }
}