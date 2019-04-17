import { parse, codegen } from 'vega-expression';

/**
 * @typedef {Object} FormulaConfig
 * @prop {string} expr
 * @prop {string} as
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
    console.log(cg);

    const parsed = parse(formulaConfig.expr);
    console.log(parsed);

    const generatedCode = cg(parsed);
    console.log(generatedCode);

    const global = { };

    const fn = Function("datum", "global", `"use strict"; return (${generatedCode.code});`);

    return rows.map(row => ({
        ...row,
        [formulaConfig.as]: fn(row, global)
    }));
}