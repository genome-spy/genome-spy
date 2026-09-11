import {
    asSelectionConfig,
    createIntervalSelection,
    isIntervalSelection,
    isIntervalSelectionConfig,
    isPointSelectionConfig,
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
    if (!isIntervalSelectionConfig(select)) {
        throw new Error(
            'Selection "' +
                name +
                '" does not expose a row-backed interval capability.'
        );
    }

    const effectiveRuntime = runtime.findRuntimeForParam(name);
    if (!effectiveRuntime) {
        throw new Error('Selection "' + name + '" has no runtime value.');
    }

    const controller =
        /** @type {{ contains: (point: { x: number, y: number }) => boolean }} */ (
            runtime.getSelectionController(name)
        );
    if (!controller) {
        throw new Error(
            'Selection "' + name + '" has no interaction host in this scope.'
        );
    }

    return {
        type: "interval",

        getValue() {
            return copySelection(effectiveRuntime.getValue(name));
        },

        subscribe(listener, options = {}) {
            if (options.delivery === "commit") {
                throw new Error(
                    'Selection commit delivery is not available yet for "' +
                        name +
                        '".'
                );
            }

            return effectiveRuntime.subscribe(name, () => {
                listener(copySelection(effectiveRuntime.getValue(name)));
            });
        },

        clear() {
            runtime.setValue(name, createIntervalSelection(select.encodings));
        },

        contains(point) {
            if (typeof controller.contains !== "function") {
                throw new Error(
                    'Selection "' +
                        name +
                        '" does not support containment queries.'
                );
            }
            return controller.contains(point);
        },
    };
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

    throw new Error(
        `Selection snapshot does not support "${selection.type}" selections.`
    );
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
                listener(valueRuntime.getValue(name));
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
 * - Point selection parameters are readable but cannot be written through this
 *   API because valid values require GenomeSpy-generated datum ids.
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
