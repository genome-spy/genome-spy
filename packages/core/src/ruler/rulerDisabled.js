import { isExprRef, makeConstantExprRef } from "../paramRuntime/paramUtils.js";
import { createRulerValue } from "./rulerValue.js";

/**
 * Clears on entry to the disabled state, including initialization. Updating the
 * flag before clearing also handles expressions that depend on the ruler value.
 * @param {import("./rulerMouseEventController.js").RulerMouseEventController | import("./rulerViewportController.js").RulerViewportController} controller
 * @returns {() => void} Unsubscribes when the controller is disposed.
 */
export function bindRulerDisabled(controller) {
    const { config, paramRuntime, paramName, channels } = controller;
    const read = isExprRef(config.disabled)
        ? paramRuntime.createExpression(config.disabled.expr)
        : makeConstantExprRef(config.disabled ?? false);
    const update = () => {
        const wasDisabled = controller.disabled;
        controller.disabled = !!read();
        if (controller.disabled && !wasDisabled) {
            paramRuntime.setValue(paramName, createRulerValue(channels));
        }
    };
    const dispose = read.subscribe(update);
    update();
    return dispose;
}
