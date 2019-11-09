import createFunction from "../../utils/expression";
/**
 * @typedef {import("../../spec/transform").FormulaConfig} FormulaConfig
 */

/**
 *
 * @param {FormulaConfig} formulaConfig
 * @param {Object[]} rows
 */
export default function formulaTransform(formulaConfig, rows) {
    const fn = createFunction(formulaConfig.expr);

    if (formulaConfig.inplace) {
        // Faster, but causes side effects.
        // TODO: Build a "dataflow graph" and infer where in-place modifications are acceptable
        for (const row of rows) {
            row[formulaConfig.as] = fn(row);
        }
        return rows;
    } else {
        return rows.map(row => ({
            ...row,
            [formulaConfig.as]: fn(row)
        }));
    }
}
