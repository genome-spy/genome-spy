export { genomeSpyInspector } from "./inspectorPlugin.js";
export { default as InspectorSession } from "./inspectorSession.js";

/**
 * @typedef {object} InspectorHost
 * @prop {() => any | undefined} getGenomeSpy
 * @prop {(view: object | null) => void} [highlightView]
 */

/**
 * Creates an embeddable inspector panel and its backing session.
 *
 * @param {InspectorHost | { genomeSpy?: any }} host
 * @param {{ activePanel?: string }} [options]
 * @returns {Promise<{
 *   panel: import("./components/inspectorPanel.js").GsInspectorPanel,
 *   session: import("./inspectorSession.js").default,
 *   dispose: () => void
 * }>}
 */
export async function createInspectorPanel(host, options = {}) {
    const [{ default: InspectorSession }, { GsInspectorPanel }] =
        await Promise.all([
            import("./inspectorSession.js"),
            import("./components/inspectorPanel.js"),
        ]);

    const session = new InspectorSession(host);
    const panel = new GsInspectorPanel();
    panel.session = session;
    if (options.activePanel) {
        panel.activePanel = options.activePanel;
    }

    return {
        panel,
        session,
        dispose: () => {
            session.dispose();
            panel.remove();
        },
    };
}
