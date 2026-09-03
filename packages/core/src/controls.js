import css, { overrideStyle } from "./controls/styles.js";

export { button } from "./controls/button.js";
export { pngButton, svgButton } from "./controls/imageButtons.js";
export { fullWindowButton } from "./controls/fullWindow.js";

/** @typedef {"inside" | "top" | "bottom"} ControlsPlacement */

/**
 * @typedef {object} MountedControl
 * @prop {HTMLElement} element The panel inserts this element in list order.
 * @prop {() => void} dispose Releases resources and restores temporary state.
 */

/**
 * @typedef {object} ControlContext
 * @prop {HTMLElement} container The same connected element passed to `embed()`.
 * @prop {import("./types/embedApi.js").EmbedResult} api The public embed API.
 * @prop {AbortSignal} signal Aborted before disposing mounted controls. Async
 * actions must check this before performing side effects after awaiting work.
 * @prop {(message: string) => void} showStatus Shows a message; an empty string clears it.
 * @prop {(error: unknown) => void} reportError Shows an error and calls `onError`.
 * @prop {(placement: ControlsPlacement) => (() => void)} overridePlacement
 * Temporarily changes panel placement and returns a restorer. Restore nested
 * overrides in reverse order. Used by controls that expand the container.
 */

/**
 * A reusable definition. Each mount creates independent DOM and state. If mount
 * throws, it must release any resources it created before returning.
 * @typedef {object} Control
 * @prop {(context: ControlContext) => MountedControl} mount
 */

/**
 * @typedef {object} ControlsOptions
 * @prop {readonly Control[]} controls Explicit controls in display order; no default buttons.
 * @prop {ControlsPlacement} [placement] Defaults to `"inside"`. Top/bottom sit
 * outside the embed container; the caller supplies space and allows overflow.
 * @prop {"hover" | "always"} [visibility] Reveal controls on container hover or focus,
 * or keep them visible. Defaults to `"hover"` inside and `"always"` for top/bottom.
 * Devices without hover keep controls visible.
 * @prop {(error: unknown) => void} [onError] Receives errors in addition to the visible message.
 */

/**
 * Attaches optional controls to the same container used by `embed()`.
 * This module does not register or import rendering backends.
 *
 * Call `dispose()` before finalizing the embed or removing its container.
 * It aborts the shared signal, disposes controls in reverse mount order, and
 * restores the container styles. The returned element's internal DOM is private.
 *
 * @param {HTMLElement} container
 * @param {import("./types/embedApi.js").EmbedResult} api
 * @param {ControlsOptions} options
 * @returns {{element: HTMLDivElement, dispose: () => void}}
 */
export function attachControls(container, api, options) {
    if (!container.isConnected) {
        throw new Error(
            "The controls container must be connected to the document."
        );
    }
    if (!Array.isArray(options?.controls)) {
        throw new Error("An explicit controls array is required.");
    }
    const doc = container.ownerDocument;
    const placement = options.placement ?? "inside";
    validatePlacement(placement);
    const visibility =
        options.visibility ?? (placement == "inside" ? "hover" : "always");
    if (visibility != "hover" && visibility != "always") {
        throw new Error("Unknown controls visibility: " + visibility);
    }

    const element = doc.createElement("div");
    element.dataset.visibility = visibility;
    element.dataset.placement = placement;
    const shadow = element.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = css;
    const buttons = doc.createElement("div");
    buttons.className = "buttons";
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", "Visualization controls");
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    status.hidden = true;
    shadow.append(style, buttons, status);

    const listeners = new AbortController();
    const { signal } = listeners;

    // Mirror the embed container's activity without depending on :host-context(),
    // which is not supported by every browser.
    function updateContainerActivity() {
        if (!signal.aborted) {
            element.toggleAttribute(
                "data-container-active",
                container.matches(":hover, :focus-within")
            );
        }
    }
    for (const type of [
        "pointerenter",
        "pointerleave",
        "focusin",
        "focusout",
    ]) {
        container.addEventListener(
            type,
            // Reparenting into a dialog can dispatch pointerenter before :hover
            // is updated. Read it in the next frame, after hit testing settles.
            () =>
                doc.defaultView.requestAnimationFrame(updateContainerActivity),
            {
                signal: listeners.signal,
            }
        );
    }
    buttons.addEventListener(
        "click",
        (event) => {
            if (event.detail > 0) {
                // Pointer activation should not pin the overlay open. Keyboard
                // activation keeps focus, including after expanding or restoring.
                queueMicrotask(() => {
                    const active = shadow.activeElement;
                    if (active instanceof HTMLElement) {
                        active.blur();
                    }
                });
            }
        },
        { signal: listeners.signal }
    );

    /** @param {string} message */
    function showStatus(message) {
        if (signal.aborted) {
            return;
        }
        status.textContent = message;
        status.hidden = !message;
    }

    /** @param {unknown} error */
    function reportError(error) {
        if (signal.aborted) {
            return;
        }
        showStatus(
            "Unable to complete action: " +
                (error instanceof Error ? error.message : String(error))
        );
        options.onError?.(error);
    }

    const restorePosition = overrideStyle(
        container,
        doc.defaultView.getComputedStyle(container).position == "static"
            ? { position: "relative" }
            : {}
    );
    /** @type {MountedControl[]} */
    const mounted = [];
    /** @type {ControlContext} */
    const context = {
        container,
        api,
        signal,
        showStatus,
        reportError,
        overridePlacement(placement) {
            validatePlacement(placement);
            const previous = element.dataset.placement;
            element.dataset.placement = placement;
            return () => {
                element.dataset.placement = previous;
            };
        },
    };

    function dispose() {
        if (signal.aborted) {
            return;
        }
        listeners.abort();
        const errors = [];
        for (const control of mounted.toReversed()) {
            try {
                control.dispose();
            } catch (error) {
                errors.push(error);
            }
        }
        element.remove();
        restorePosition();
        if (errors.length) {
            throw new AggregateError(errors, "Unable to dispose controls.");
        }
    }

    try {
        for (const definition of options.controls) {
            const control = definition.mount(context);
            mounted.push(control);
            buttons.append(control.element);
        }
        container.append(element);
        updateContainerActivity();
    } catch (error) {
        dispose();
        throw error;
    }
    return { element, dispose };
}

/** @param {ControlsPlacement} placement */
function validatePlacement(placement) {
    if (placement != "inside" && placement != "top" && placement != "bottom") {
        throw new Error("Unknown controls placement: " + placement);
    }
}
