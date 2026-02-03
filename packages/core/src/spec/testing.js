/**
 * Test-only spec typings for internal helpers and fixtures.
 */

/**
 * @typedef {import("./channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("../data/flowNode.js").Datum} Datum
 */

/**
 * Testing-only lazy data source parameters.
 *
 * @typedef {object} MockLazyData
 * @prop {"mockLazy"} type
 * @prop {PrimaryPositionalChannel} [channel]
 * @prop {number} [delay]
 * @prop {Datum[]} [data]
 */

export {};
