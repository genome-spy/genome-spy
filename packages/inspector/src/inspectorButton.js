import { button } from "@genome-spy/core/controls/button.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faBug } from "@fortawesome/free-solid-svg-icons";
import { attachInspectorOverlay } from "./inspectorUi.js";

/**
 * Creates a button that opens one Inspector overlay for the attached embed.
 * The mount context supplies the inspected runtime's debug API.
 *
 * @param {import("./index.d.ts").InspectorButtonOptions} [options]
 * @returns {import("@genome-spy/core/controls").Control}
 */
export function inspectorButton(options = {}) {
    return {
        mount(context) {
            /** @type {Awaited<ReturnType<typeof attachInspectorOverlay>> | undefined} */
            let inspector;
            const mounted = button({
                label: options.text ?? "Inspector",
                title: options.title ?? "Inspect visualization",
                icon:
                    options.text === undefined
                        ? icon(faBug).node[0]
                        : undefined,
                async onClick() {
                    if (inspector?.element.isConnected) {
                        inspector.element.focus({ preventScroll: true });
                        return;
                    }
                    context.showStatus("Loading Inspector…");
                    inspector = await attachInspectorOverlay(
                        context.api.debug,
                        {
                            container: context.container,
                            width: options.width,
                            activePanel: options.activePanel,
                            signal: context.signal,
                        }
                    );
                    if (context.signal.aborted) {
                        inspector.dispose();
                        inspector = undefined;
                        return;
                    }
                    inspector.panel.addEventListener(
                        "close",
                        () => {
                            inspector = undefined;
                            mounted.element.focus({ preventScroll: true });
                        },
                        { once: true, signal: context.signal }
                    );
                    inspector.element.focus({ preventScroll: true });
                    context.showStatus("");
                },
            }).mount(context);
            mounted.element.setAttribute("aria-haspopup", "dialog");
            return {
                element: mounted.element,
                dispose() {
                    mounted.dispose();
                    inspector?.dispose();
                    inspector = undefined;
                },
            };
        },
    };
}
