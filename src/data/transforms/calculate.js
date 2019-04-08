import { parse, codegen } from 'vega-expression';

/**
 * @typedef {Object} CalculateConfig
 * @prop {string} type
 * @prop {string} calculate
 * @prop {string} as
 */


 /**
  * 
  * @param {CalculateConfig} calculateConfig 
  * @param {Object[]} rows 
  */
export function calculateTransform(calculateConfig, rows) {
    const cg = codegen({
        blacklist: [],
        whitelist: ["datum"],
        globalvar: "global",
        fieldvar: "datum"
    });
    console.log(cg);

    const parsed = parse(calculateConfig.calculate);
    console.log(parsed);

    const generatedCode = cg(parsed);
    console.log(generatedCode);

    const global = { };

    const fn = Function("datum", "global", `"use strict"; return (${generatedCode.code});`);

    return rows.map(row => ({
        ...row,
        [calculateConfig.as]: fn(row, global)
    }));
}