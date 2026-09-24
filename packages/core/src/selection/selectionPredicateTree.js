import { validateParameterName } from "../paramRuntime/paramUtils.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { field } from "../utils/field.js";

/**
 * @typedef {{param: string, empty: boolean, project?: {x?: "x" | "x2", y?: "y" | "y2"}}} SelectionLeaf
 * @typedef {{selectionActive: string}} SelectionActivity
 * @typedef {SelectionLeaf | SelectionActivity | {all: readonly SelectionPredicateTree[]} | {any: readonly SelectionPredicateTree[]} | {not: SelectionPredicateTree}} SelectionPredicateTree
 * @typedef {{component: string, input: string, field: string, secondaryInput?: string, secondaryField?: string, hitTest?: "intersects" | "encloses" | "endpoints"}} SelectionProjection
 * @typedef {{param: string, type: "single" | "multi" | "interval", empty: boolean, projections?: SelectionProjection[]} | {selectionActive: {param: string, type: "single" | "multi" | "interval", components: string[]}} | {all: readonly ResolvedSelectionPredicate[]} | {any: readonly ResolvedSelectionPredicate[]} | {not: ResolvedSelectionPredicate}} ResolvedSelectionPredicate
 */

/**
 * Parses the public predicate grammar and lowers the flat-union shorthand into
 * membership and activity atoms. The resulting tree has no use-site bindings.
 *
 * @param {import("../spec/channel.js").ParameterPredicate | import("../spec/channel.js").TestPredicate} condition
 * @returns {SelectionPredicateTree}
 */
export function normalizeSelectionPredicateTree(condition) {
    const operand =
        "test" in condition
            ? condition.test
            : {
                  param: condition.param,
                  ...(condition.empty !== undefined
                      ? { empty: condition.empty }
                      : {}),
                  ...(condition.project !== undefined
                      ? { project: condition.project }
                      : {}),
              };

    /** @param {unknown} value @returns {SelectionPredicateTree} */
    const parse = (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Selection predicate must be an object.");
        }
        const node = /** @type {Record<string, any>} */ (value);
        const operators = ["param", "and", "or", "not"].filter(
            (key) => key in node
        );
        if (operators.length !== 1) {
            throw new Error(
                "Selection predicate must have exactly one operator."
            );
        }
        const operator = operators[0];
        if (operator === "param") {
            if (typeof node.param === "string") {
                if (
                    Object.keys(node).some(
                        (key) => !["param", "empty", "project"].includes(key)
                    ) ||
                    typeof (node.empty ?? true) !== "boolean"
                ) {
                    throw new Error("Invalid selection parameter predicate.");
                }
                if (node.project !== undefined) {
                    const project = node.project;
                    if (
                        !project ||
                        typeof project !== "object" ||
                        Array.isArray(project) ||
                        Object.keys(project).length === 0 ||
                        Object.entries(project).some(
                            ([component, target]) =>
                                !["x", "y"].includes(component) ||
                                (target !== component &&
                                    target !== component + "2")
                        )
                    ) {
                        throw new Error(
                            "Invalid interval selection projection."
                        );
                    }
                }
                return Object.freeze({
                    param: validateParameterName(node.param),
                    empty: node.empty ?? true,
                    ...(node.project
                        ? { project: Object.freeze({ ...node.project }) }
                        : {}),
                });
            }
            if (
                !node.param ||
                typeof node.param !== "object" ||
                Object.keys(node.param).length !== 1 ||
                !Array.isArray(node.param.or) ||
                Object.keys(node).some(
                    (key) => !["param", "empty"].includes(key)
                ) ||
                typeof (node.empty ?? true) !== "boolean"
            ) {
                throw new Error("Invalid flat selection union.");
            }
            if (node.param.or.length === 0) {
                throw new Error(
                    'Selection test "or" must be a nonempty array.'
                );
            }
            const names = Array.from(
                new Set(node.param.or.map(validateParameterName))
            );
            const activities = names.map((selectionActive) =>
                Object.freeze({ selectionActive })
            );
            const members = names.map((param, index) =>
                Object.freeze({
                    all: Object.freeze([
                        Object.freeze({ param, empty: true }),
                        activities[index],
                    ]),
                })
            );
            return Object.freeze({
                any: Object.freeze(
                    node.empty === false
                        ? members
                        : [
                              ...members,
                              Object.freeze({
                                  not: Object.freeze({
                                      any: Object.freeze(activities),
                                  }),
                              }),
                          ]
                ),
            });
        }
        if (Object.keys(node).length !== 1) {
            throw new Error("Selection predicate operators cannot be mixed.");
        }
        if (operator === "not") {
            return Object.freeze({ not: parse(node.not) });
        }
        const operands = node[operator];
        if (!Array.isArray(operands) || operands.length === 0) {
            throw new Error(
                `Selection test "${operator}" must be a nonempty array.`
            );
        }
        const children = Object.freeze(operands.map(parse));
        return operator === "and"
            ? Object.freeze({ all: children })
            : Object.freeze({ any: children });
    };

    return parse(operand);
}

/** @param {SelectionPredicateTree | ResolvedSelectionPredicate} tree @returns {string[]} */
export function getSelectionPredicateTreeParams(tree) {
    const names = new Set();
    /** @param {SelectionPredicateTree | ResolvedSelectionPredicate} node */
    const visit = (node) => {
        if ("param" in node) {
            names.add(node.param);
        } else if ("selectionActive" in node) {
            names.add(
                typeof node.selectionActive === "string"
                    ? node.selectionActive
                    : node.selectionActive.param
            );
        } else if ("not" in node) {
            visit(node.not);
        } else {
            for (const child of "all" in node ? node.all : node.any) {
                visit(child);
            }
        }
    };
    visit(tree);
    return Array.from(names);
}

/** @param {ResolvedSelectionPredicate} tree @returns {ResolvedSelectionPredicate} */
export function activeMatchResolvedSelectionPredicate(tree) {
    const activities = new Map();
    /** @param {ResolvedSelectionPredicate} node */
    const visit = (node) => {
        if ("param" in node) {
            activities.set(node.param, {
                selectionActive: {
                    param: node.param,
                    type: node.type,
                    components:
                        node.projections?.map(({ component }) => component) ??
                        [],
                },
            });
        } else if ("selectionActive" in node) {
            activities.set(node.selectionActive.param, node);
        } else if ("not" in node) {
            visit(node.not);
        } else {
            for (const child of "all" in node ? node.all : node.any) {
                visit(child);
            }
        }
    };
    visit(tree);
    return { all: [tree, { any: Array.from(activities.values()) }] };
}

/** @param {SelectionPredicateTree} tree @returns {boolean} */
export function selectionPredicateMatchesWhenEmpty(tree) {
    if ("param" in tree) {
        return tree.empty;
    }
    if ("selectionActive" in tree) {
        return false;
    }
    if ("not" in tree) {
        return !selectionPredicateMatchesWhenEmpty(tree.not);
    }
    const children = "all" in tree ? tree.all : tree.any;
    return "all" in tree
        ? children.every(selectionPredicateMatchesWhenEmpty)
        : children.some(selectionPredicateMatchesWhenEmpty);
}

/**
 * Binds selection components and mark inputs once after the view hierarchy and
 * its scale resolutions exist. Each occurrence retains its own projection.
 *
 * @param {SelectionPredicateTree} tree
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {{findValue: (name: string) => any, findSelectionCapability?: (name: string) => {type: "single" | "multi" | "interval", components: {component: string, type?: import("../spec/channel.js").Type}[]} | undefined}} runtime
 * @param {"intersects" | "encloses" | "endpoints"} hitTestMode
 * @param {(channel: "x" | "x2" | "y" | "y2") => import("../spec/channel.js").Type | undefined} [getType]
 * @returns {ResolvedSelectionPredicate}
 */
export function resolveSelectionPredicateTree(
    tree,
    encoding,
    runtime,
    hitTestMode,
    getType
) {
    /** @param {string} name @returns {{type: "single" | "multi" | "interval", components: {component: string, type?: import("../spec/channel.js").Type}[]}} */
    const capability = (name) => {
        const registered = runtime.findSelectionCapability?.(name);
        if (registered) {
            return registered;
        }
        const value = runtime.findValue(name);
        if (!value || !["single", "multi", "interval"].includes(value.type)) {
            throw new Error(`Selection parameter "${name}" was not found.`);
        }
        return {
            type: /** @type {"single" | "multi" | "interval"} */ (value.type),
            components:
                value.type === "interval"
                    ? Object.keys(/** @type {object} */ (value.intervals)).map(
                          (component) => ({ component })
                      )
                    : [],
        };
    };

    const definitions = /** @type {Record<string, any>} */ (encoding);

    /** @param {string} input */
    const fieldForInput = (input) => {
        const definition = definitions[input];
        if (definition && "field" in definition) {
            return definition.field;
        }
        if (definition && "condition" in definition) {
            const conditions = Array.isArray(definition.condition)
                ? definition.condition
                : [definition.condition];
            return conditions.find(
                (/** @type {any} */ candidate) => "field" in candidate
            )?.field;
        }
        return undefined;
    };

    if ("all" in tree) {
        return {
            all: tree.all.map((child) =>
                resolveSelectionPredicateTree(
                    child,
                    encoding,
                    runtime,
                    hitTestMode,
                    getType
                )
            ),
        };
    }
    if ("any" in tree) {
        return {
            any: tree.any.map((child) =>
                resolveSelectionPredicateTree(
                    child,
                    encoding,
                    runtime,
                    hitTestMode,
                    getType
                )
            ),
        };
    }
    if ("not" in tree) {
        return {
            not: resolveSelectionPredicateTree(
                tree.not,
                encoding,
                runtime,
                hitTestMode,
                getType
            ),
        };
    }
    const name = "param" in tree ? tree.param : tree.selectionActive;
    const declared = capability(name);
    if ("selectionActive" in tree) {
        return {
            selectionActive: {
                param: name,
                type: declared.type,
                components: declared.components.map(
                    ({ component }) => component
                ),
            },
        };
    }
    if (tree.project && declared.type !== "interval") {
        throw new Error(
            `Selection "${name}" is not an interval selection; project is invalid.`
        );
    }
    if (declared.type !== "interval") {
        return { param: name, type: declared.type, empty: tree.empty };
    }
    const components = declared.components.map(({ component }) => component);
    if (
        tree.project &&
        (Object.keys(tree.project).length !== components.length ||
            components.some((component) => !(component in tree.project)))
    ) {
        throw new Error(
            `Selection "${name}" project must cover its declared components: ${components.join(", ")}.`
        );
    }
    const projections = declared.components.map(({ component, type }) => {
        const input =
            /** @type {Record<string, string> | undefined} */ (tree.project)?.[
                component
            ] ?? component;
        if (!["x", "x2", "y", "y2"].includes(input)) {
            throw new Error(
                `Selection "${name}" has unsupported component "${component}".`
            );
        }
        const definition = definitions[input];
        if (tree.project && (!definition || !("field" in definition))) {
            throw new Error(
                `Selection "${name}" project target "${input}" must be an unconditional field encoding.`
            );
        }
        const inputField = fieldForInput(input);
        if (!inputField) {
            throw new Error(`Selection "${name}" has no field for "${input}".`);
        }
        if (tree.project) {
            const inputType =
                getType?.(/** @type {"x" | "x2" | "y" | "y2"} */ (input)) ??
                ("type" in definition ? definition.type : undefined) ??
                ("type" in definitions[component]
                    ? definitions[component].type
                    : undefined);
            if (
                !["quantitative", "index", "locus"].includes(type) ||
                inputType !== type
            ) {
                throw new Error(
                    `Selection "${name}" project target "${input}" must have matching quantitative, index, or locus type (${type} vs ${inputType}).`
                );
            }
        }
        const secondaryInput = component + "2";
        const secondaryField =
            tree.project || !definitions[secondaryInput]
                ? undefined
                : fieldForInput(secondaryInput);
        return {
            component,
            input,
            field: inputField,
            ...(secondaryField
                ? { secondaryInput, secondaryField, hitTest: hitTestMode }
                : {}),
        };
    });
    return { param: name, type: "interval", empty: tree.empty, projections };
}

/**
 * Compiles a resolved tree for host encoders, Canvas2D, and SVG export.
 *
 * @param {ResolvedSelectionPredicate} tree
 * @param {(name: string) => import("../types/selectionTypes.js").Selection} getSelection
 * @returns {(datum: import("../data/flowNode.js").Datum) => boolean}
 */
export function compileSelectionPredicateTree(tree, getSelection) {
    if ("all" in tree) {
        const children = tree.all.map((child) =>
            compileSelectionPredicateTree(child, getSelection)
        );
        return (datum) => children.every((child) => child(datum));
    }
    if ("any" in tree) {
        const children = tree.any.map((child) =>
            compileSelectionPredicateTree(child, getSelection)
        );
        return (datum) => children.some((child) => child(datum));
    }
    if ("not" in tree) {
        const child = compileSelectionPredicateTree(tree.not, getSelection);
        return (datum) => !child(datum);
    }
    if ("selectionActive" in tree) {
        const { param } = tree.selectionActive;
        return () => isActive(getSelection(param));
    }
    const { param, type, empty } = tree;
    if (type === "single") {
        return (datum) => {
            const selection =
                /** @type {import("../types/selectionTypes.js").SinglePointSelection} */ (
                    getSelection(param)
                );
            return selection.uniqueId == null
                ? empty
                : selection.uniqueId === datum[UNIQUE_ID_KEY];
        };
    }
    if (type === "multi") {
        return (datum) => {
            const selection =
                /** @type {import("../types/selectionTypes.js").MultiPointSelection} */ (
                    getSelection(param)
                );
            return selection.data.size === 0
                ? empty
                : selection.data.has(datum[UNIQUE_ID_KEY]);
        };
    }
    const inputs = tree.projections.map((projection) => ({
        ...projection,
        read: field(projection.field),
        readSecondary: projection.secondaryField
            ? field(projection.secondaryField)
            : undefined,
    }));
    return (datum) => {
        const selection =
            /** @type {import("../types/selectionTypes.js").IntervalSelection} */ (
                getSelection(param)
            );
        let active = false;
        for (const input of inputs) {
            const interval = /** @type {Record<string, number[] | null>} */ (
                selection.intervals
            )[input.component];
            if (!interval) {
                continue;
            }
            active = true;
            const first = input.read(datum);
            const second = input.readSecondary?.(datum);
            const [lo, hi] = interval;
            const matches =
                second === undefined
                    ? lo <= first && first <= hi
                    : input.hitTest === "endpoints"
                      ? (lo <= first && first <= hi) ||
                        (lo <= second && second <= hi)
                      : input.hitTest === "encloses"
                        ? lo <= first && second <= hi
                        : lo <= second && first <= hi;
            if (!matches) {
                return false;
            }
        }
        return active || empty;
    };
}

/** @param {import("../types/selectionTypes.js").Selection} selection */
function isActive(selection) {
    if (selection.type === "single") {
        return selection.uniqueId != null;
    }
    if (selection.type === "multi") {
        return selection.data.size !== 0;
    }
    if (selection.type === "interval") {
        return Object.values(selection.intervals).some(
            (interval) => !!interval
        );
    }
    throw new Error(`Unsupported selection type: ${selection.type}`);
}
