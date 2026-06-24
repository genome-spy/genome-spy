import { faBug } from "@fortawesome/free-solid-svg-icons";
import InspectorSession from "./inspectorSession.js";

/**
 * @typedef {object} InspectorPluginOptions
 * @prop {string} [preferredWidth]
 */

/**
 * Creates the browser-side GenomeSpy inspector plugin.
 *
 * @param {InspectorPluginOptions} [options]
 */
export function genomeSpyInspector(options = {}) {
    return {
        name: "@genome-spy/inspector",

        async install(/** @type {any} */ app) {
            if (!app.ui?.registerToolbarButton) {
                throw new Error("genomeSpyInspector requires an App UI host.");
            }

            /** @type {InspectorSession | undefined} */
            let session;
            /** @type {import("@genome-spy/app/appTypes.d.ts").SidePanelHandle | undefined} */
            let panelHandle;
            /** @type {import("./components/inspectorPanel.js").GsInspectorPanel | undefined} */
            let panelElement;

            const ensurePanel = async () => {
                if (panelHandle) {
                    return panelHandle;
                }

                if (!app.ui.registerSidePanel) {
                    throw new Error(
                        "genomeSpyInspector requires side panel support."
                    );
                }

                const [{ GsInspectorPanel }] = await Promise.all([
                    import("./components/inspectorPanel.js"),
                ]);

                session = new InspectorSession(app);
                panelElement = new GsInspectorPanel();
                panelElement.session = session;
                panelHandle = app.ui.registerSidePanel({
                    id: "genome-spy-inspector",
                    element: panelElement,
                    preferredWidth:
                        options.preferredWidth ?? "min(46vw, 760px)",
                });
                return panelHandle;
            };

            const removeButton = app.ui.registerToolbarButton({
                title: "GenomeSpy Inspector",
                icon: faBug,
                onClick: async () => {
                    const handle = await ensurePanel();
                    handle.toggle();
                    await session.refresh();
                },
            });

            return () => {
                removeButton();
                session?.dispose();
                session = undefined;
                panelHandle?.dispose();
                panelHandle = undefined;
                panelElement?.remove();
                panelElement = undefined;
            };
        },
    };
}
