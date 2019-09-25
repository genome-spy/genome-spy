import { parse, codegen } from 'vega-expression';

/**
 * @typedef {Object} FormulaConfig
 * @prop {string} expr
 * @prop {string} as
 * @prop {boolean} [inplace] Modify the rows in place (a temp hack)
 */


 /**
  * 
  * @param {FormulaConfig} formulaConfig 
  * @param {Object[]} rows 
  */
export default function calculateTransform(formulaConfig, rows) {
    const cg = codegen({
        blacklist: [],
        whitelist: ["datum"],
        globalvar: "global",
        fieldvar: "datum"
    });

    const parsed = parse(formulaConfig.expr);
    const generatedCode = cg(parsed);

    const global = { };

    // eslint-disable-next-line no-new-func
    const fn = Function("datum", "global", `"use strict"; return (${generatedCode.code});`);

    
    if (formulaConfig.inplace) {
        // Faster, but causes side effects.
        // TODO: Build a "dataflow graph" and infer where in-place modifications are acceptable
        for (const row of rows) {
            row[formulaConfig.as] = fn(row, global);
        }
        return rows;

    } else {
        return rows.map(row => ({
            ...row,
            [formulaConfig.as]: fn(row, global)
        }));
    }
}