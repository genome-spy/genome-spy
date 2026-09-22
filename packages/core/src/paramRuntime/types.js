/**
 * `batchStable` means that every value change synchronously notifies
 * subscribers, allowing consumers to retain the value until the next
 * notification or explicit dataflow boundary.
 *
 * @template T
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: "base" | "derived" | "selection",
 *   rank?: number,
 *   propagation?: "sync",
 *   batchStable?: boolean,
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
 * @template T
 * @typedef {ComputedParamRef<T> & {
 *   rebind: (deps: ParamRef<any>[], evaluate: () => T) => void
 * }} OperationRef
 */

/**
 * An expression evaluator backed by a stable globals object. `refresh` copies
 * the latest batch-stable parameter values into the object without replacing
 * either the object or evaluator function.
 *
 * @typedef {((datum?: import("../data/flowNode.js").Datum) => any) & {
 *   refresh: () => void
 * }} SnapshotExpressionEvaluator
 */

/**
 * @typedef {import("../utils/expression.js").ExpressionFunction & {
 *   dependencies: ParamRef<any>[],
 *   subscribe: (listener: () => void) => () => void,
 *   invalidate: () => void,
 *   identifier: () => string,
 *   createSnapshotEvaluator?: () => SnapshotExpressionEvaluator
 * }} ExprRefFunction
 */

export {};
