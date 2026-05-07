// @ts-check
import { validateAgentActionPayloadShape } from "./actionShapeValidator.js";

/**
 * Validates submitIntentAction without surfacing the raw union-branch noise
 * from the generated schema.
 *
 * @param {unknown} toolArguments
 * @returns {import("./types.d.ts").ShapeValidationResult}
 */
export function validateSubmitIntentActionToolShape(toolArguments) {
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
        if (key !== "action" && key !== "note") {
            errors.push("$ has unexpected property " + key + ".");
        }
    }

    if (!("action" in candidate)) {
        errors.push("$.action is required.");
    } else if (!isObject(candidate.action)) {
        errors.push("$.action must be of type object.");
    } else {
        validateAction(candidate.action, "$.action", errors);
    }

    if ("note" in candidate && typeof candidate.note !== "string") {
        errors.push("$.note must be of type string.");
    }

    return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/**
 * @param {Record<string, any>} action
 * @param {string} actionPrefix
 * @param {string[]} errors
 */
function validateAction(action, actionPrefix, errors) {
    for (const key of Object.keys(action)) {
        if (key !== "actionType" && key !== "payload") {
            errors.push(actionPrefix + " has unexpected property " + key + ".");
        }
    }

    if (typeof action.actionType !== "string") {
        errors.push(actionPrefix + ".actionType must be of type string.");
        return;
    }

    if (!("payload" in action)) {
        errors.push(actionPrefix + ".payload is required.");
        return;
    }

    const payloadValidation = validateAgentActionPayloadShape(
        /** @type {import("./types.js").AgentActionType} */ (action.actionType),
        action.payload,
        actionPrefix + ".payload"
    );
    if (!payloadValidation.ok) {
        errors.push(...payloadValidation.errors);
    }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
