import { SELECTION_CHECKER_PREFIX } from "../../wgsl/prefixes.js";

/**
 * @typedef {import("../../index.d.ts").ScalarSlotConfig} ScalarSlotConfig
 * @typedef {import("./channelIR.js").ChannelIR} ChannelIR
 * @typedef {import("../../index.d.ts").VisibilityPredicate} VisibilityPredicate
 * @typedef {import("../../index.d.ts").ScalarOperand} ScalarOperand
 */

/**
 * @param {string} name
 * @returns {string}
 */
export function scalarSlotUniformName(name) {
    return `u_scalar_${name}`;
}

/**
 * Validate the structural union shape before any predicate consumer traverses it.
 *
 * @param {VisibilityPredicate | undefined} predicate
 * @returns {VisibilityPredicate | undefined}
 */
export function normalizeVisibilityPredicate(predicate) {
    if (predicate === undefined) {
        return undefined;
    }

    /**
     * @param {unknown} node
     * @returns {VisibilityPredicate}
     */
    function normalizeNode(node) {
        if (!node || typeof node !== "object" || Array.isArray(node)) {
            throw new Error("Visibility predicate nodes must be objects.");
        }

        const nodeRecord = /** @type {Record<string, unknown>} */ (node);
        const kinds = ["compare", "selection", "all", "any"].filter((key) =>
            Object.hasOwn(nodeRecord, key)
        );
        if (kinds.length !== 1) {
            throw new Error(
                "Visibility predicate nodes must specify exactly one of compare, selection, all, or any."
            );
        }

        const kind = kinds[0];
        if (kind === "all" || kind === "any") {
            const children = nodeRecord[kind];
            if (!Array.isArray(children) || children.length === 0) {
                throw new Error(
                    `Visibility predicate ${kind} nodes must not be empty.`
                );
            }
            children.forEach(normalizeNode);
        }
        return /** @type {VisibilityPredicate} */ (node);
    }

    return normalizeNode(predicate);
}

/**
 * @typedef {object} VisibilityBuildParams
 * @property {VisibilityPredicate} [predicate]
 * @property {ChannelIR[]} channelIRs
 * @property {Set<string>} channelNames
 * @property {Set<string>} inputNames
 * @property {Record<string, ScalarSlotConfig>} scalarSlots
 * @property {Array<{ name: string, type: import("../../index.d.ts").SelectionType, targets?: Array<{ input: string, secondaryInput?: string, hitTest?: "intersects"|"encloses"|"endpoints", scalarType?: import("../../types.js").ScalarType, secondaryScalarType?: import("../../types.js").ScalarType }> }>} selectionDefs
 */

/**
 * Validate and emit the immutable point visibility predicate tree.
 *
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
}) {
    predicate = normalizeVisibilityPredicate(predicate);
    const channelIRByName = new Map(
        channelIRs.map((channelIR) => [channelIR.name, channelIR])
    );
    const selectionNames = new Set(selectionDefs.map((def) => def.name));

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
        const operandRecord = /** @type {Record<string, unknown>} */ (operand);
        const name = operandRecord[key];
        if (typeof name !== "string" || name.length === 0) {
            throw new Error(
                `Visibility predicate ${key} operands require a name.`
            );
        }

        if (key === "channel") {
            if (!channelNames.has(name)) {
                throw new Error(
                    `Visibility predicate references unknown channel "${name}".`
                );
            }
            const channelIR = channelIRByName.get(name);
            return emitChannelOperand(name, channelIR);
        }
        if (key === "input") {
            if (!inputNames.has(name)) {
                throw new Error(
                    `Visibility predicate references unknown input "${name}".`
                );
            }
            const channelIR = channelIRByName.get(name);
            return emitChannelOperand(name, channelIR);
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

        throw new Error(
            `Visibility predicate has unsupported operand namespace "${key}".`
        );
    }

    /**
     * @param {string} name
     * @param {ChannelIR | undefined} channelIR
     * @returns {{ expression: string, type: import("../../types.js").ScalarType }}
     */
    function emitChannelOperand(name, channelIR) {
        if (!channelIR) {
            throw new Error(
                `Visibility predicate references unavailable input "${name}".`
            );
        }
        if (channelIR.inputComponents !== 1) {
            throw new Error(
                `Visibility predicate input "${name}" must be scalar, got ${channelIR.inputComponents} components.`
            );
        }
        return {
            expression: channelIR.rawValueExpr,
            type: channelIR.scalarType,
        };
    }

    /**
     * @param {VisibilityPredicate} node
     * @returns {string}
     */
    function emitNode(node) {
        if ("compare" in node) {
            if (
                node.compare !== "<" &&
                node.compare !== "<=" &&
                node.compare !== ">" &&
                node.compare !== ">="
            ) {
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

        if ("selection" in node) {
            if (
                typeof node.selection !== "string" ||
                !selectionNames.has(node.selection)
            ) {
                throw new Error(
                    `Visibility predicate references unknown selection "${node.selection}".`
                );
            }
            if (node.empty !== undefined && typeof node.empty !== "boolean") {
                throw new Error(
                    `Visibility predicate selection "${node.selection}" empty policy must be boolean.`
                );
            }
            return `${SELECTION_CHECKER_PREFIX}${node.selection}(i, ${node.empty === true ? "true" : "false"})`;
        }

        if ("all" in node || "any" in node) {
            const operator = "all" in node ? "&&" : "||";
            const children = "all" in node ? node.all : node.any;
            return `(${children.map(emitNode).join(` ${operator} `)})`;
        }

        throw new Error("Visibility predicate has an unsupported node shape.");
    }

    const expression = predicate ? emitNode(predicate) : "true";
    return /* wgsl */ `
fn isInstanceVisible(i: u32) -> bool {
    return ${expression};
}
`;
}
