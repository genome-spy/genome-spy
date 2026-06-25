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
            if (!app.ui?.registerToolbarMenuItem) {
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

            /**
             * @param {{ panel?: string }} [openOptions]
             */
            const openInspector = async (openOptions = {}) => {
                const handle = await ensurePanel();
                if (openOptions.panel && panelElement) {
                    panelElement.activePanel = openOptions.panel;
                }
                handle.show();
                await session.refresh();
            };

            const removeMenuItem = app.ui.registerToolbarMenuItem({
                label: "GenomeSpy Inspector",
                icon: faBug,
                callback: () => openInspector(),
            });
            const removeLauncher = app.ui.registerInspectorLauncher
                ? app.ui.registerInspectorLauncher({
                      open: openInspector,
                  })
                : /** @returns {void} */ () => {};

            return () => {
                removeLauncher();
                removeMenuItem();
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
