import { createEventFilterFunction } from "./expression.js";

/**
 * @typedef {import("./interactionEvent.js").InteractionUiEvent} InteractionUiEvent
 */

/**
 * @param {import("../spec/parameter.js").SelectionConfig["on"]} eventType
 * @returns {import("../spec/parameter.js").EventConfig}
 */
export function asEventConfig(eventType) {
    if (typeof eventType === "string") {
        const m = eventType.match(/^([a-zA-Z]+)(?:\[(.+)\])?$/);
        if (!m) {
            throw new Error(`Invalid event type string: ${eventType}`);
        }
        const [, type, filter] = m;
        /** @type {import("../spec/parameter.js").EventConfig} */
        const eventSpec = {
            type: /** @type {import("../spec/parameter.js").DomEventType} */ (
                type
            ),
        };
        if (filter) {
            eventSpec.filter = filter;
        }
        return eventSpec;
    } else {
        return eventType;
    }
}

/**
 * @param {import("../spec/parameter.js").EventConfig | undefined} eventConfig
 * @param {import("../types/embedApi.js").SpecLocation} [location]
 * @returns {(event: InteractionUiEvent) => boolean}
 */
export function createEventPredicate(eventConfig, location) {
    return eventConfig?.filter
        ? createEventFilterFunction(eventConfig.filter, location)
        : () => true;
}

/**
 * @param {import("../paramRuntime/viewParamRuntime.js").default} runtime
 * @param {Partial<Record<"on" | "clear" | "zoom", unknown>> | undefined} config Authored interaction config, before shorthand normalization.
 * @param {"on" | "clear" | "zoom"} key
 */
export function getEventFilterLocation(runtime, config, key) {
    return runtime.getSpecLocation(config, [
        key,
        ...(typeof config?.[key] === "object" ? ["filter"] : []),
    ]);
}

/**
 * @template {import("../spec/parameter.js").EventConfig} T
 * @param {T} eventConfig
 * @param {string[]} allowedTypes
 * @param {string} message
 * @returns {T}
 */
export function validateEventType(eventConfig, allowedTypes, message) {
    if (!allowedTypes.includes(eventConfig.type)) {
        throw new Error(message);
    }

    return eventConfig;
}
