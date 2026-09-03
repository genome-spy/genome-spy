import { overrideStyle } from "./styles.js";

/**
 * Creates a full-window toggle. Expansion moves the live embed into a dialog;
 * Escape or disposal restores it. Container-sized views resize automatically.
 * @returns {import("../controls.js").Control}
 */
export function fullWindowButton() {
    return { mount: mountFullWindowButton };
}

/** @param {import("../controls.js").ControlContext} context */
function mountFullWindowButton(context) {
    const { container, reportError } = context;
    const doc = container.ownerDocument;
    if (container == doc.body || container == doc.documentElement) {
        throw new Error(
            "Full-window controls require a dedicated visualization container."
        );
    }
    const button = doc.createElement("button");
    button.type = "button";
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    const path = doc.createElementNS(svg.namespaceURI, "path");
    svg.append(path);
    button.append(svg);

    const dialog = doc.createElement("dialog");
    dialog.setAttribute("aria-label", "Full-window visualization");
    dialog.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;box-sizing:border-box;overflow:auto;background:white;color:inherit;";
    const placeholder = doc.createComment("GenomeSpy full-window container");
    /** @type {(() => void) | undefined} */
    let restore;

    function updateButton() {
        const expanded = !!restore;
        button.title = expanded
            ? "Restore visualization size"
            : "Expand to full window";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(expanded));
        path.setAttribute(
            "d",
            expanded
                ? "M2 7h5V2m6 0v5h5M2 13h5v5m6 0v-5h5"
                : "M7 2H2v5m11-5h5v5M2 13v5h5m6 0h5v-5"
        );
    }

    function collapse() {
        if (!restore) {
            return;
        }
        dialog.close();
        placeholder.replaceWith(container);
        restore();
        restore = undefined;
        dialog.remove();
        updateButton();
        button.focus({ preventScroll: true });
    }

    function expand() {
        // Reparenting can shrink scroll containers and clamp their offsets.
        /** @type {{element: HTMLElement, left: number, top: number}[]} */
        const scrollPositions = [];
        for (
            let element = container.parentElement;
            element;
            element = element.parentElement
        ) {
            scrollPositions.push({
                element,
                left: element.scrollLeft,
                top: element.scrollTop,
            });
        }
        // Restore only properties owned by this action; preserve unrelated container edits.
        const restoreContainer = overrideStyle(container, {
            position: "relative",
            top: "auto",
            right: "auto",
            bottom: "auto",
            left: "auto",
            width: "100%",
            height: "100%",
            "min-width": "0",
            "min-height": "0",
            "max-width": "none",
            "max-height": "none",
            "margin-top": "0",
            "margin-right": "0",
            "margin-bottom": "0",
            "margin-left": "0",
            "box-sizing": "border-box",
        });
        const restoreScroll = overrideStyle(doc.documentElement, {
            "overflow-x": "hidden",
            "overflow-y": "hidden",
        });
        const restorePlacement = context.overridePlacement("inside");
        restore = () => {
            restorePlacement();
            restoreContainer();
            restoreScroll();
            for (const { element, left, top } of scrollPositions) {
                element.scrollLeft = left;
                element.scrollTop = top;
            }
        };
        container.before(placeholder);
        dialog.append(container);
        doc.body.append(dialog);
        try {
            dialog.showModal();
        } catch (error) {
            collapse();
            throw error;
        }
        updateButton();
        button.focus({ preventScroll: true });
    }

    const listeners = new AbortController();
    button.addEventListener(
        "click",
        () => {
            try {
                if (restore) {
                    collapse();
                } else {
                    expand();
                }
            } catch (error) {
                reportError(error);
            }
        },
        { signal: listeners.signal }
    );
    dialog.addEventListener(
        "cancel",
        (event) => {
            event.preventDefault();
            collapse();
        },
        { signal: listeners.signal }
    );
    // Also restore if the embedding application closes the dialog itself.
    dialog.addEventListener(
        "close",
        () => {
            if (!dialog.open) {
                collapse();
            }
        },
        { signal: listeners.signal }
    );
    updateButton();

    return {
        element: button,
        dispose() {
            collapse();
            listeners.abort();
        },
    };
}
