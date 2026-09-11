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
 * @typedef {import("../spec/parameter.js").Parameter} Parameter
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
            ensureParamApiIsLive(lifecycle);
            return resolveScopedEmbedParam(view, name, lifecycle);
        },

        getSelection(name) {
            ensureParamApiIsLive(lifecycle);
            return resolveEmbedSelection(view, name, lifecycle);
        },
    });
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
    ensureParamApiIsLive(lifecycle);
    const declaration = view.paramRuntime.findConfiguredParam(name);
    if (!declaration) {
        throw new Error('Parameter "' + name + '" not found.');
    }

    const effectiveRuntime = declaration.runtime.findRuntimeForParam(name);
    if (!effectiveRuntime) {
        throw new Error('Parameter "' + name + '" has no runtime value.');
    }

    const config = declaration.runtime.paramConfigs.get(name);
    const readOnly = Boolean(config && "expr" in config);
    return createParamApi(effectiveRuntime, name, lifecycle, (value) => {
        if (readOnly) {
            throw new Error('Cannot set computed parameter "' + name + '".');
        }
        declaration.runtime.setValue(name, value);
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
    ensureParamApiIsLive(lifecycle);
    const declaration = view.paramRuntime.findConfiguredParam(name);
    if (!declaration) {
        throw new Error('Selection "' + name + '" not found.');
    }

    const { config, runtime } = declaration;
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

    const effectiveRuntime = runtime.findRuntimeForParam(name);
    if (!effectiveRuntime) {
        throw new Error('Selection "' + name + '" has no runtime value.');
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
            return copySelection(effectiveRuntime.getValue(name));
        },

        subscribe(
            /** @type {(value: SelectionSnapshot) => void} */ listener,
            /** @type {{ delivery?: "change" | "commit" }} */ options = {}
        ) {
            ensureParamApiIsLive(lifecycle);
            if (options.delivery === "commit") {
                if (!controller) {
                    return subscribeToSettledValue(
                        effectiveRuntime,
                        name,
                        () => {
                            callEmbedListener(
                                listener,
                                copySelection(effectiveRuntime.getValue(name))
                            );
                        },
                        lifecycle
                    );
                }
                return registerParamDisposer(
                    lifecycle,
                    controller.subscribeCommit((selection) =>
                        callEmbedListener(listener, copySelection(selection))
                    )
                );
            }

            return subscribeToSettledValue(
                effectiveRuntime,
                name,
                () => {
                    callEmbedListener(
                        listener,
                        copySelection(effectiveRuntime.getValue(name))
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
 * @returns {import("../types/embedApi.js").SelectionSnapshot}
 */
function copySelection(selection) {
    if (isIntervalSelection(selection)) {
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
        };
    }

    if (isSinglePointSelection(selection)) {
        return {
            type: "point",
            active: selection.datum !== null,
            data: selection.datum ? [copyDatum(selection.datum)] : [],
        };
    }

    if (isMultiPointSelection(selection)) {
        return {
            type: "point",
            active: selection.data.size > 0,
            data: Array.from(selection.data.values(), copyDatum),
        };
    }

    throw new Error(
        `Selection snapshot does not support "${selection.type}" selections.`
    );
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
    const matches = collectParamMatches(root, name);
    if (!matches.length) {
        throw new Error('Parameter "' + name + '" not found.');
    }

    const effectiveMatches = new Map();
    for (const match of matches) {
        const runtime = match.view.paramRuntime.findRuntimeForParam(name);
        if (!runtime) {
            throw new Error('Parameter "' + name + '" has no runtime value.');
        }

        effectiveMatches.set(runtime, {
            runtime,
            readOnly: hasExprParam(effectiveMatches.get(runtime), match),
            pointSelection: hasPointSelectionParam(
                effectiveMatches.get(runtime),
                match
            ),
        });
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

/**
 * @param {{ readOnly: boolean } | undefined} previous
 * @param {{ param: Parameter }} match
 * @returns {boolean}
 */
function hasExprParam(previous, match) {
    return Boolean(previous?.readOnly || "expr" in match.param);
}

/**
 * @param {{ pointSelection: boolean } | undefined} previous
 * @param {{ param: Parameter }} match
 * @returns {boolean}
 */
function hasPointSelectionParam(previous, match) {
    if (previous?.pointSelection) {
        return true;
    }

    const param = match.param;
    return (
        "select" in param &&
        isPointSelectionConfig(asSelectionConfig(param.select))
    );
}

/**
 * @param {View} root
 * @param {string} name
 * @returns {{ view: View, param: Parameter }[]}
 */
function collectParamMatches(root, name) {
    /** @type {{ view: View, param: Parameter }[]} */
    const matches = [];

    root.visit((view) => {
        const param = view.paramRuntime.paramConfigs.get(name);
        if (param) {
            matches.push({ view, param });
        }
    });

    return matches;
}
