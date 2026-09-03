/**
 * @typedef {object} ButtonOptions
 * @prop {string} label Accessible name and default hover title; shown as text without an icon.
 * @prop {string} [title] Hover title. Defaults to `label`; `""` suppresses it.
 * @prop {Element} [icon] Decorative SVG or HTML element, cloned for each mount.
 * Use inline styles or SVG attributes; page CSS does not enter the shadow root.
 * @prop {(context: import("../controls.js").ControlContext) => void | Promise<void>} onClick
 * Action to run. Rejections are reported through the panel. Check `context.signal`
 * before performing side effects after awaiting work.
 */

/**
 * Creates a text or icon button for an application action. The button is disabled while
 * its action runs; errors appear in the panel and are passed to `onError`.
 * @param {ButtonOptions} options
 * @returns {import("../controls.js").Control}
 */
export function button(options) {
    if (!options.label.trim()) {
        throw new Error("A button requires a non-empty accessible label.");
    }
    return {
        mount(context) {
            const doc = context.container.ownerDocument;
            const element = doc.createElement("button");
            element.type = "button";
            if (options.icon) {
                const icon = doc.createElement("span");
                icon.className = "icon";
                icon.setAttribute("aria-hidden", "true");
                icon.inert = true;
                icon.append(doc.importNode(options.icon, true));
                element.append(icon);
            } else {
                element.textContent = options.label;
            }
            element.title = options.title ?? options.label;
            element.setAttribute("aria-label", options.label);
            async function activate() {
                element.disabled = true;
                context.showStatus("");
                try {
                    await options.onClick(context);
                } catch (error) {
                    context.reportError(error);
                } finally {
                    element.disabled = false;
                }
            }
            element.addEventListener("click", activate, {
                signal: context.signal,
            });
            return {
                element,
                dispose() {
                    element.removeEventListener("click", activate);
                },
            };
        },
    };
}
