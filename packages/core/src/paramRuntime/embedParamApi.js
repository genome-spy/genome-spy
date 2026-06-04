import {
    asSelectionConfig,
    isPointSelectionConfig,
} from "../selection/selection.js";

/**
 * @typedef {import("../view/view.js").default} View
 * @typedef {import("../spec/parameter.js").Parameter} Parameter
 * @typedef {import("../types/embedApi.js").ParamApi} ParamApi
 */

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
