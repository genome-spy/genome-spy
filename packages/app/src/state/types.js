/**
 * Centralized JSDoc typedefs for application state slices.
 */

/**
 * @typedef {object} SampleViewState
 * @prop {any[]} [samples]
 */

/**
 * @typedef {object} ProvenancePresentState
 * @prop {any} [lastAction]
 */

/**
 * View settings stored in the app state.
 * @typedef {object} ViewSettings
 * @prop {Record<string, boolean>} visibilities
 */

/**
 * Root application state. Add other slices as needed.
 * @typedef {object} RootState
 * @prop {SampleViewState} [sampleView]
 * @prop {import("redux-undo").StateWithHistory<ProvenancePresentState>} [provenance]
 * @prop {ViewSettings} [viewSettings]
 */

export {};
