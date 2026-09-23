import {
    SELECTION_CHECKER_PREFIX,
    SELECTION_EMPTY_PREFIX,
} from "../../wgsl/prefixes.js";

/**
 * @typedef {import("../../index.d.ts").VisibilityPredicate} VisibilityPredicate
 * @typedef {import("../../index.d.ts").SelectionPredicate} SelectionPredicate
 * @typedef {import("../../index.d.ts").ScalarOperand} ScalarOperand
 * @typedef {import("../../index.d.ts").ScalarSlotConfig} ScalarSlotConfig
 * @typedef {import("./channelIR.js").ChannelIR} ChannelIR
 */

/**
 * @param {unknown} predicate
 * @param {boolean} allowComparison
 * @returns {VisibilityPredicate}
 */
function validatePredicate(predicate, allowComparison) {
    if (
        !predicate ||
        typeof predicate !== "object" ||
        Array.isArray(predicate)
    ) {
        throw new Error("Predicate nodes must be objects.");
    }
    const node = /** @type {Record<string, unknown>} */ (predicate);
    const variants = [
        "compare",
        "selection",
        "selectionActive",
        "all",
        "any",
        "not",
    ];
    const kinds = variants.filter((key) => Object.hasOwn(node, key));
    if (kinds.length !== 1) {
        throw new Error("Predicate nodes must specify exactly one variant.");
    }
    const kind = kinds[0];
    if (kind === "all" || kind === "any") {
        const children = node[kind];
        if (!Array.isArray(children) || children.length === 0) {
            throw new Error(`Predicate ${kind} nodes must not be empty.`);
        }
        if (Object.keys(node).length !== 1) {
            throw new Error(
                `Predicate ${kind} nodes cannot mix variants or leaf properties.`
            );
        }
        children.forEach((child) => validatePredicate(child, allowComparison));
    } else if (kind === "not") {
        if (Object.keys(node).length !== 1) {
            throw new Error(
                "Predicate not nodes cannot mix variants or leaf properties."
            );
        }
        validatePredicate(node.not, allowComparison);
    } else if (kind === "compare") {
        if (!allowComparison) {
            throw new Error("Selection predicates cannot contain comparisons.");
        }
        if (
            Object.keys(node).some(
                (key) => !["compare", "left", "right"].includes(key)
            )
        ) {
            throw new Error(
                "Comparison predicates cannot mix variants or leaf properties."
            );
        }
    } else if (kind === "selectionActive") {
        const reference = node.selectionActive;
        if (
            !reference ||
            typeof reference !== "object" ||
            Object.keys(node).length !== 1
        ) {
            throw new Error("Selection activity requires a state reference.");
        }
        const state = /** @type {Record<string, unknown>} */ (reference);
        if (typeof state.selection !== "string" || !state.selection) {
            throw new Error("Selection activity requires a selection name.");
        }
        if (state.type === "interval") {
            if (
                !Array.isArray(state.components) ||
                !state.components.length ||
                state.components.some(
                    (component) => typeof component !== "string" || !component
                ) ||
                new Set(state.components).size !== state.components.length
            ) {
                throw new Error(
                    "Interval selection activity requires distinct components."
                );
            }
            if (
                Object.keys(state).some(
                    (key) => !["selection", "type", "components"].includes(key)
                )
            ) {
                throw new Error(
                    "Interval selection activity has unsupported properties."
                );
            }
        } else if (state.type !== "single" && state.type !== "multi") {
            throw new Error("Selection activity has an invalid type.");
        } else if (
            Object.keys(state).some(
                (key) => !["selection", "type"].includes(key)
            )
        ) {
            throw new Error("Selection activity has unsupported properties.");
        }
    } else {
        if (typeof node.selection !== "string" || !node.selection) {
            throw new Error("Selection predicates require a selection name.");
        }
        if (node.empty !== undefined && typeof node.empty !== "boolean") {
            throw new Error("Selection empty policy must be boolean.");
        }
        if (node.type === "interval") {
            if (
                !Array.isArray(node.projections) ||
                node.projections.length === 0
            ) {
                throw new Error(
                    "Interval selections require non-empty projections."
                );
            }
            if (
                Object.keys(node).some(
                    (key) =>
                        !["selection", "type", "projections", "empty"].includes(
                            key
                        )
                )
            ) {
                throw new Error(
                    "Interval selection predicates cannot mix variants or leaf properties."
                );
            }
        } else if (
            (node.type !== "single" && node.type !== "multi") ||
            Object.hasOwn(node, "projections")
        ) {
            throw new Error(
                "Selection predicates have an invalid type or projections."
            );
        } else if (
            Object.keys(node).some(
                (key) => !["selection", "type", "empty"].includes(key)
            )
        ) {
            throw new Error(
                "Selection predicates cannot mix variants or leaf properties."
            );
        }
    }
    return /** @type {VisibilityPredicate} */ (predicate);
}

/**
 * @param {VisibilityPredicate | undefined} predicate
 * @returns {VisibilityPredicate | undefined}
 */
export function normalizeVisibilityPredicate(predicate) {
    return predicate === undefined
        ? undefined
        : validatePredicate(predicate, true);
}

/**
 * @param {SelectionPredicate | undefined} predicate
 * @returns {SelectionPredicate | undefined}
 */
export function normalizeSelectionPredicate(predicate) {
    return predicate === undefined
        ? undefined
        : /** @type {SelectionPredicate} */ (
              validatePredicate(predicate, false)
          );
}

/**
 * @param {VisibilityPredicate} node
 * @param {ReadonlyMap<string, import("../programs/internal/selectionResources.js").SelectionDef>} selectionDefs
 * @param {(node: import("../../index.d.ts").ScalarComparisonPredicate) => string} [emitComparison]
 * @returns {string}
 */
export function emitPredicateExpression(node, selectionDefs, emitComparison) {
    if ("all" in node || "any" in node) {
        const operator = "all" in node ? "&&" : "||";
        const children = "all" in node ? node.all : node.any;
        return `(${children.map((child) => emitPredicateExpression(child, selectionDefs, emitComparison)).join(` ${operator} `)})`;
    }
    if ("not" in node) {
        return `(!${emitPredicateExpression(node.not, selectionDefs, emitComparison)})`;
    }
    if ("compare" in node) {
        if (!emitComparison) {
            throw new Error(
                "Comparisons are only available in visibility predicates."
            );
        }
        return emitComparison(node);
    }

    const reference = "selectionActive" in node ? node.selectionActive : node;
    const def = selectionDefs.get(reference.selection);
    if (!def || def.type !== reference.type) {
        throw new Error(
            `Predicate references unknown or incompatible selection "${reference.selection}".`
        );
    }
    if ("selectionActive" in node) {
        return `(!${SELECTION_EMPTY_PREFIX}${def.name}(i))`;
    }
    if (node.type === "interval") {
        const checks = node.projections.map((projection) => {
            const index = def.projections?.findIndex(
                (item) =>
                    item.component === projection.component &&
                    item.input === projection.input &&
                    item.secondaryInput === projection.secondaryInput &&
                    item.hitTest === (projection.hitTest ?? "intersects")
            );
            if (index === undefined || index < 0) {
                throw new Error(
                    `Selection "${def.name}" has an unknown projection.`
                );
            }
            return `${SELECTION_CHECKER_PREFIX}${def.name}_p${index}(i, ${node.empty !== false ? "true" : "false"})`;
        });
        return `(${checks.join(" && ")})`;
    }
    return `${SELECTION_CHECKER_PREFIX}${def.name}(i, ${node.empty !== false ? "true" : "false"})`;
}

/** @param {string} name @returns {string} */
export function scalarSlotUniformName(name) {
    return `u_scalar_${name}`;
}

/**
 * @typedef {object} VisibilityBuildParams
 * @property {VisibilityPredicate} [predicate]
 * @property {ChannelIR[]} channelIRs
 * @property {ReadonlySet<string>} channelNames
 * @property {ReadonlySet<string>} inputNames
 * @property {Record<string, ScalarSlotConfig>} scalarSlots
 * @property {Array<import("../programs/internal/selectionResources.js").SelectionDef>} selectionDefs
 * @property {string} [functionName]
 */

/**
 * @param {VisibilityBuildParams} params
 * @returns {string}
 */
export function buildVisibilityPredicate({
    predicate,
    channelIRs,
    channelNames,
    inputNames,
    scalarSlots,
    selectionDefs,
    functionName = "isInstanceVisible",
}) {
    const channelIRByName = new Map(
        channelIRs.map((channelIR) => [channelIR.name, channelIR])
    );
    const defs = new Map(selectionDefs.map((def) => [def.name, def]));

    /**
     * @param {ScalarOperand} operand
     * @returns {{ expression: string, type: import("../../types.js").ScalarType }}
     */
    function emitOperand(operand) {
        if (!operand || typeof operand !== "object") {
            throw new Error("Visibility predicate operands must be objects.");
        }
        const keys = Object.keys(operand);
        if (keys.length !== 1) {
            throw new Error(
                "Visibility predicate operands must specify exactly one namespace."
            );
        }
        const key = keys[0];
        const name = /** @type {Record<string, string>} */ (operand)[key];
        if (typeof name !== "string" || !name) {
            throw new Error(
                `Visibility predicate ${key} operands require a name.`
            );
        }
        if (key === "slot") {
            const slot = scalarSlots[name];
            if (!slot) {
                throw new Error(
                    `Visibility predicate references unknown slot "${name}".`
                );
            }
            return {
                expression: `params.${scalarSlotUniformName(name)}`,
                type: slot.type,
            };
        }
        if (
            (key === "channel" && channelNames.has(name)) ||
            (key === "input" && inputNames.has(name))
        ) {
            const channelIR = channelIRByName.get(name);
            if (!channelIR || channelIR.inputComponents !== 1) {
                throw new Error(
                    `Visibility predicate input "${name}" must be scalar.`
                );
            }
            return {
                expression: channelIR.rawValueExpr,
                type: channelIR.scalarType,
            };
        }
        throw new Error(
            `Visibility predicate references unknown ${key} "${name}".`
        );
    }

    /**
     * @param {import("../../index.d.ts").ScalarComparisonPredicate} node
     * @returns {string}
     */
    function emitComparison(node) {
        if (!["<", "<=", ">", ">="].includes(node.compare)) {
            throw new Error(
                `Visibility predicate has unsupported comparison "${node.compare}".`
            );
        }
        const left = emitOperand(node.left);
        const right = emitOperand(node.right);
        if (left.type !== right.type) {
            throw new Error(
                `Visibility predicate comparison types must match: ${left.type} and ${right.type}.`
            );
        }
        return `(${left.expression} ${node.compare} ${right.expression})`;
    }

    const expression = predicate
        ? emitPredicateExpression(predicate, defs, emitComparison)
        : "true";
    return /* wgsl */ `
fn ${functionName}(i: u32) -> bool {
    return ${expression};
}
`;
}
