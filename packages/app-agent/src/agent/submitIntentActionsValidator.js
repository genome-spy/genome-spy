// @ts-check
import { validateActionPayloadShape } from "./actionShapeValidator.js";

/**
 * Validates submitIntentActions without surfacing the raw union-branch noise
 * from the generated schema.
 *
 * @param {unknown} toolArguments
 * @returns {import("./types.d.ts").ShapeValidationResult}
 */
export function validateSubmitIntentActionsToolShape(toolArguments) {
    if (!isObject(toolArguments)) {
        return {
            ok: false,
            errors: ["$ must be of type object."],
        };
    }

    const candidate = /** @type {Record<string, any>} */ (toolArguments);
    /** @type {string[]} */
    const errors = [];

    for (const key of Object.keys(candidate)) {
        if (key !== "actions" && key !== "note") {
            errors.push("$ has unexpected property " + key + ".");
        }
    }

    if (!("actions" in candidate)) {
        errors.push("$.actions is required.");
    } else if (!Array.isArray(candidate.actions)) {
        errors.push("$.actions must be of type array.");
    } else if (candidate.actions.length === 0) {
        errors.push("$.actions must contain at least 1 item(s).");
    } else {
        for (const [index, action] of candidate.actions.entries()) {
            const actionPrefix = "$.actions[" + index + "]";
            if (!isObject(action)) {
                errors.push(actionPrefix + " must be of type object.");
                continue;
            }

            for (const key of Object.keys(action)) {
                if (key !== "actionType" && key !== "payload") {
                    errors.push(
                        actionPrefix + " has unexpected property " + key + "."
                    );
                }
            }

            if (typeof action.actionType !== "string") {
                errors.push(
                    actionPrefix + ".actionType must be of type string."
                );
                continue;
            }

            if (!("payload" in action)) {
                errors.push(actionPrefix + ".payload is required.");
                continue;
            }

            const payloadValidation = validateActionPayloadShape(
                /** @type {import("./types.js").AgentActionType} */ (
                    action.actionType
                ),
                action.payload,
                actionPrefix + ".payload"
            );
            if (!payloadValidation.ok) {
                errors.push(...payloadValidation.errors);
            }
        }
    }

    if ("note" in candidate && typeof candidate.note !== "string") {
        errors.push("$.note must be of type string.");
    }

    return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
