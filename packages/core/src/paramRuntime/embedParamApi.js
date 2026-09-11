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

/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("../spec/parameter.js").Parameter} Parameter
 * @typedef {import("../types/embedApi.js").ParamApi} ParamApi
 * @typedef {import("../types/embedApi.js").SelectionApi} SelectionApi
 */

/**
 * Creates the modern parameter namespace for a lexical view scope.
 *
 * @param {View} view
 * @returns {import("../types/embedApi.js").ParamNamespace}
 */
export function createEmbedParamNamespace(view) {
    return /** @type {import("../types/embedApi.js").ParamNamespace} */ ({
        get(name) {
            return resolveScopedEmbedParam(view, name);
        },

        getSelection(name) {
            return resolveEmbedSelection(view, name);
        },
    });
}

/**
 * Resolves a parameter using the nearest authored declaration in `view`.
 *
 * @param {View} view
 * @param {string} name
 * @returns {ParamApi}
 */
export function resolveScopedEmbedParam(view, name) {
    const declaration = view.paramRuntime.findConfiguredParam(name);
    if (!declaration) {
        throw new Error('Parameter "' + name + '" not found.');
    }

    const effectiveRuntime = declaration.runtime.findRuntimeForParam(name);
    if (!effectiveRuntime) {
        throw new Error('Parameter "' + name + '" has no runtime value.');
    }

    return createParamApi(declaration.runtime, effectiveRuntime, name);
}

/**
 * Resolves a selection capability using the nearest authored declaration.
 * A plain parameter shadows any selection with the same name in an ancestor.
 *
 * @param {View} view
 * @param {string} name
 * @returns {SelectionApi}
 */
export function resolveEmbedSelection(view, name) {
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
        ? /** @type {{
           * contains: (point: { x: number, y: number }) => boolean,
           * subscribeCommit: (listener: (selection: any) => void) => () => void,
           * clear: () => void
           * }} */ (runtime.getSelectionController(name))
        : undefined;
    if (isIntervalSelectionConfig(select) && !controller) {
        throw new Error(
            'Selection "' + name + '" has no interaction host in this scope.'
        );
    }

    return /** @type {SelectionApi} */ ({
        type: select.type,

        getValue() {
            return copySelection(effectiveRuntime.getValue(name));
        },

        subscribe(
            /** @type {(value: any) => void} */ listener,
            /** @type {{ delivery?: "change" | "commit" }} */ options = {}
        ) {
            if (options.delivery === "commit") {
                if (!controller) {
                    return effectiveRuntime.subscribe(name, () => {
                        callSelectionListener(
                            listener,
                            copySelection(effectiveRuntime.getValue(name))
                        );
                    });
                }
                return controller.subscribeCommit((selection) =>
                    callSelectionListener(listener, copySelection(selection))
                );
            }

            return effectiveRuntime.subscribe(name, () => {
                callSelectionListener(
                    listener,
                    copySelection(effectiveRuntime.getValue(name))
                );
            });
        },

        clear() {
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

/**
 * Reports a host callback failure without preventing other selection listeners.
 * @param {(value: import("../types/embedApi.js").SelectionSnapshot) => void} listener
 * @param {import("../types/embedApi.js").SelectionSnapshot} value
 */
function callSelectionListener(listener, value) {
    try {
        listener(value);
    } catch (error) {
        console.error(error);
    }
}

/** @param {(value: any) => void} listener @param {any} value */
function callParamListener(listener, value) {
    try {
        listener(value);
    } catch (error) {
        console.error(error);
    }
}

/**
 * @param {import("../paramRuntime/viewParamRuntime.js").default} setterRuntime
 * @param {import("../paramRuntime/viewParamRuntime.js").default} valueRuntime
 * @param {string} name
 * @returns {ParamApi}
 */
function createParamApi(setterRuntime, valueRuntime, name) {
    const config = setterRuntime.paramConfigs.get(name);
    const readOnly = Boolean(config && "expr" in config);

    return {
        getValue() {
            return valueRuntime.getValue(name);
        },

        setValue(value) {
            if (readOnly) {
                throw new Error(
                    'Cannot set computed parameter "' + name + '".'
                );
            }
            setterRuntime.setValue(name, value);
        },

        subscribe(listener) {
            return valueRuntime.subscribe(name, () => {
                callParamListener(listener, valueRuntime.getValue(name));
            });
        },
    };
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

    return {
        getValue() {
            return runtime.getValue(name);
        },

        setValue(value) {
            if (readOnly) {
                throw new Error(
                    'Cannot set computed parameter "' + name + '".'
                );
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
        },

        subscribe(listener) {
            return runtime.subscribe(name, () => {
                listener(runtime.getValue(name));
            });
        },
    };
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
