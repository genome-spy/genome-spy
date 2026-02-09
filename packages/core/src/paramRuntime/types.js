/**
 * @template T
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: "base" | "derived" | "selection",
 *   get: () => T,
 *   subscribe: (listener: () => void) => () => void
 * }} ParamRef
 */

/**
 * @template T
 * @typedef {ParamRef<T> & { set: (value: T) => void }} WritableParamRef
 */

/**
 * @typedef {import("../utils/expression.js").ExpressionFunction & {
 *   addListener: (listener: () => void) => void,
 *   removeListener: (listener: () => void) => void,
 *   invalidate: () => void,
 *   identifier: () => string
 * }} ExprRefFunction
 */

export {};
