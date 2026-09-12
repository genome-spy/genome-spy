import {
    asSelectionConfig,
    createMultiPointSelection,
    createSinglePointSelection,
    isIntervalSelection,
    isIntervalSelectionConfig,
    isMultiPointSelection,
    isPointSelectionConfig,
    isSinglePointSelection,
} from "../selection/selection.js";
import { bindDisposer } from "../utils/bindDisposer.js";

/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("../types/embedApi.js").ParamApi} ParamApi
 * @typedef {import("../types/embedApi.js").SelectionApi} SelectionApi
 * @typedef {import("../types/embedApi.js").SelectionSnapshot} SelectionSnapshot
 * @typedef {object} ParamApiLifecycle
 * @property {() => boolean} [isActive]
 * @property {() => boolean} [isLive]
 * @property {(disposer: () => void) => void} [registerDisposer]
 */

/**
 * Creates the modern parameter namespace for a lexical view scope.
 *
 * @param {View} view
 * @param {ParamApiLifecycle} [lifecycle]
 * @returns {import("../types/embedApi.js").ParamNamespace}
 */
export function createEmbedParamNamespace(view, lifecycle = {}) {
    return /** @type {import("../types/embedApi.js").ParamNamespace} */ ({
        get(name) {
            return resolveScopedEmbedParam(view, name, lifecycle);
        },

        getSelection(name) {
            return resolveEmbedSelection(view, name, lifecycle);
        },
    });
}

/**
 * @param {View} view
 * @param {string} name
 * @param {"Parameter" | "Selection"} kind
 * @param {ParamApiLifecycle} lifecycle
 * @returns {{
 *     config: import("../spec/parameter.js").Parameter,
 *     runtime: import("./viewParamRuntime.js").default,
 *     valueRuntime: import("./viewParamRuntime.js").default
 * }}
 */
function resolveScopedEmbedDeclaration(view, name, kind, lifecycle) {
    ensureParamApiIsLive(lifecycle);
    const declaration = view.paramRuntime.findConfiguredParam(name);
    if (!declaration) throw new Error(`${kind} "${name}" not found.`);

    const valueRuntime = declaration.runtime.findRuntimeForParam(name);
    if (!valueRuntime)
        throw new Error(`${kind} "${name}" has no runtime value.`);

    return { ...declaration, valueRuntime };
}

/**
 * Resolves a parameter using the nearest authored declaration in `view`.
 *
 * @param {View} view
 * @param {string} name
 * @param {ParamApiLifecycle} [lifecycle]
 * @returns {ParamApi}
 */
export function resolveScopedEmbedParam(view, name, lifecycle = {}) {
    const { config, runtime, valueRuntime } = resolveScopedEmbedDeclaration(
        view,
        name,
        "Parameter",
        lifecycle
    );
    const readOnly = "expr" in config;
    return createParamApi(valueRuntime, name, lifecycle, (value) => {
        if (readOnly) {
            throw new Error('Cannot set computed parameter "' + name + '".');
        }
        runtime.setValue(name, value);
    });
}

/**
 * Resolves a selection capability using the nearest authored declaration.
 * A plain parameter shadows any selection with the same name in an ancestor.
 *
 * @param {View} view
 * @param {string} name
 * @param {ParamApiLifecycle} [lifecycle]
 * @returns {SelectionApi}
 */
export function resolveEmbedSelection(view, name, lifecycle = {}) {
    const { config, runtime, valueRuntime } = resolveScopedEmbedDeclaration(
        view,
        name,
        "Selection",
        lifecycle
    );
    if (!("select" in config)) {
        throw new Error(
            'Parameter "' + name + '" is not a selection in this scope.'
        );
    }

    const select = asSelectionConfig(config.select);
    if (!isIntervalSelectionConfig(select) && !isPointSelectionConfig(select)) {
        throw new Error(
            'Selection "' + name + '" does not expose a row-backed capability.'
        );
    }

    const controller = isIntervalSelectionConfig(select)
        ? runtime.getSelectionController(name)
        : undefined;
    if (isIntervalSelectionConfig(select) && !controller) {
        throw new Error(
            'Selection "' + name + '" has no interaction host in this scope.'
        );
    }

    return /** @type {SelectionApi} */ ({
        type: select.type,

        getValue() {
            ensureParamApiIsLive(lifecycle);
            return copySelection(valueRuntime.getValue(name), controller);
        },

        subscribe(
            /** @type {(value: SelectionSnapshot) => void} */ listener,
            /** @type {{ delivery?: "change" | "commit" }} */ options = {}
        ) {
            ensureParamApiIsLive(lifecycle);
            if (options.delivery === "commit" && controller) {
                return registerParamDisposer(
                    lifecycle,
                    controller.subscribeCommit((selection) =>
                        listener(copySelection(selection, controller))
                    )
                );
            }

            return subscribeToSettledValue(
                valueRuntime,
                name,
                () => {
                    callEmbedListener(
                        listener,
                        copySelection(valueRuntime.getValue(name), controller)
                    );
                },
                lifecycle
            );
        },

        clear() {
            ensureParamApiIsLive(lifecycle);
            if (controller) {
                controller.clear();
            } else if (isPointSelectionConfig(select) && select.toggle) {
                runtime.setValue(name, createMultiPointSelection());
            } else {
                runtime.setValue(name, createSinglePointSelection(null));
            }
        },

        ...(controller
            ? {
                  contains(point) {
                      ensureParamApiIsLive(lifecycle);
                      return controller.contains(point);
                  },
              }
            : {}),
    });
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {import("../types/interactionApi.d.ts").IntervalSelectionControllerApi} [intervalController]
 * @returns {import("../types/embedApi.js").SelectionSnapshot}
 */
function copySelection(selection, intervalController) {
    if (isIntervalSelection(selection)) {
        if (!intervalController) {
            throw new Error(
                "Interval selection has no interaction controller."
            );
        }

        return {
            type: "interval",
            active: Object.values(selection.intervals).some(
                (interval) => interval !== null
            ),
            intervals: Object.fromEntries(
                Object.entries(selection.intervals).map(
                    ([channel, interval]) => [
                        channel,
                        interval
                            ? /** @type {[number, number]} */ ([...interval])
                            : null,
                    ]
                )
            ),
            complexIntervals: intervalController.getComplexIntervals(
                selection.intervals
            ),
        };
    }

    let data;
    if (isSinglePointSelection(selection)) {
        data = selection.datum ? [selection.datum] : [];
    } else if (isMultiPointSelection(selection)) {
        data = Array.from(selection.data.values());
    } else {
        throw new Error(
            `Selection snapshot does not support "${selection.type}" selections.`
        );
    }

    return {
        type: "point",
        active: data.length > 0,
        data: data.map(copyDatum),
    };
}

/** @param {import("../data/flowNode.js").Datum} datum */
function copyDatum(datum) {
    const copy = { ...datum };
    delete copy.__uniqueId;
    return copy;
}

/** @param {(value: any) => void} listener @param {any} value */
function callEmbedListener(listener, value) {
    try {
        listener(value);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Observes a parameter after graph propagation has settled.
 *
 * @param {import("../paramRuntime/viewParamRuntime.js").default} runtime
 * @param {string} name
 * @param {() => void} listener
 * @param {ParamApiLifecycle} lifecycle
 * @returns {() => void}
 */
function subscribeToSettledValue(runtime, name, listener, lifecycle) {
    const ref = runtime.getParamRef(name);
    if (!ref) {
        throw new Error("Parameter not found: " + name);
    }
    return registerParamDisposer(lifecycle, runtime.effect([ref], listener));
}

/**
 * @param {import("../paramRuntime/viewParamRuntime.js").default} valueRuntime
 * @param {string} name
 * @param {ParamApiLifecycle} lifecycle
 * @param {(value: any) => void} setValue
 * @returns {ParamApi}
 */
function createParamApi(valueRuntime, name, lifecycle, setValue) {
    return {
        getValue() {
            ensureParamApiIsLive(lifecycle);
            return valueRuntime.getValue(name);
        },

        setValue(value) {
            ensureParamApiIsLive(lifecycle);
            setValue(value);
        },

        subscribe(listener) {
            ensureParamApiIsLive(lifecycle);
            return subscribeToSettledValue(
                valueRuntime,
                name,
                () => {
                    callEmbedListener(listener, valueRuntime.getValue(name));
                },
                lifecycle
            );
        },
    };
}

/**
 * @param {ParamApiLifecycle} lifecycle
 */
function ensureParamApiIsLive(lifecycle) {
    if (lifecycle.isActive && !lifecycle.isActive()) {
        throw new Error(
            "Cannot use a parameter or selection handle after the embed was finalized."
        );
    }
    if (lifecycle.isLive && !lifecycle.isLive()) {
        throw new Error(
            "Cannot use a parameter or selection handle after its view was removed."
        );
    }
}

/**
 * @param {ParamApiLifecycle} lifecycle
 * @param {() => void} unsubscribe
 * @returns {() => void}
 */
function registerParamDisposer(lifecycle, unsubscribe) {
    return lifecycle.registerDisposer
        ? bindDisposer(lifecycle.registerDisposer, unsubscribe)
        : unsubscribe;
}

/**
 * Returns a parameter handle for an explicit parameter exposed by the embed API.
 *
 * Current limitations:
 *
 * - Parameters are addressed by name only. Independent same-name parameters
 *   throw an ambiguity error.
 * - Computed `expr` parameters are readable but cannot be written.
 * - Point selection parameters remain read-only through the legacy parameter
 *   API; use `getSelection()` for snapshots and clearing.
 * - Projected selections are not supported.
 *
 * @param {View} root
 * @param {string} name
 * @returns {ParamApi}
 */
export function resolveEmbedParam(root, name) {
    const effectiveMatches = new Map();
    root.visit((view) => {
        const param = view.paramRuntime.paramConfigs.get(name);
        if (!param) {
            return;
        }

        const runtime = view.paramRuntime.findRuntimeForParam(name);
        if (!runtime) {
            throw new Error('Parameter "' + name + '" has no runtime value.');
        }

        const previous = effectiveMatches.get(runtime);
        effectiveMatches.set(runtime, {
            runtime,
            readOnly: Boolean(previous?.readOnly || "expr" in param),
            pointSelection: Boolean(
                previous?.pointSelection ||
                ("select" in param &&
                    isPointSelectionConfig(asSelectionConfig(param.select)))
            ),
        });
    });

    if (effectiveMatches.size === 0) {
        throw new Error('Parameter "' + name + '" not found.');
    }

    if (effectiveMatches.size > 1) {
        throw new Error('Parameter "' + name + '" is ambiguous.');
    }

    const { runtime, readOnly, pointSelection } = effectiveMatches
        .values()
        .next().value;

    const setValue = (/** @type {any} */ value) => {
        if (readOnly) {
            throw new Error('Cannot set computed parameter "' + name + '".');
        }
        if (pointSelection) {
            throw new Error(
                'Cannot set point selection parameter "' +
                    name +
                    '" through the embed API.'
            );
        }

        runtime.setValue(name, value);
        root.context.animator.requestRender();
    };

    return createParamApi(runtime, name, {}, setValue);
}
