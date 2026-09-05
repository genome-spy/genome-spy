/**
 * @template T
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: "base" | "derived" | "selection",
 *   rank?: number,
 *   propagation?: "sync",
 *   get: () => T,
 *   subscribe: (listener: () => void) => () => void
 * }} ParamRef
 */

/**
 * @template T
 * @typedef {ParamRef<T> & { set: (value: T) => void }} WritableParamRef
 */

/**
 * @template T
 * @typedef {ParamRef<T> & { dispose: () => void }} ComputedParamRef
 */

/**
 * @typedef {import("../utils/expression.js").ExpressionFunction & {
 *   dependencies: ParamRef<any>[],
 *   subscribe: (listener: () => void) => () => void,
 *   invalidate: () => void,
 *   identifier: () => string
 * }} ExprRefFunction
 */

export {};
