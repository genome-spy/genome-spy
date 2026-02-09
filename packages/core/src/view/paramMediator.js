/**
 * @typedef {import("../utils/expression.js").ExpressionFunction & {
 *   addListener: (listener: () => void) => void,
 *   removeListener: (listener: () => void) => void,
 *   invalidate: () => void,
 *   identifier: () => string
 * }} ExprRefFunction
 */

export { default } from "../paramRuntime/viewParamRuntime.js";

export {
    activateExprRefProps,
    getDefaultParamValue,
    isExprRef,
    isSelectionParameter,
    isVariableParameter,
    makeConstantExprRef,
    validateParameterName,
    withoutExprRef,
} from "../paramRuntime/paramUtils.js";
