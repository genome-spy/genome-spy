export { genomeSpyInspector } from "./inspectorPlugin.js";
export { default as InspectorSession } from "./inspectorSession.js";

/**
 * @typedef {object} InspectorHost
 * @prop {() => any | undefined} [getRootView]
 * @prop {() => any | undefined} [getGenomeSpy]
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

/**
 * Attaches the inspector as a fixed-position overlay.
 *
 * @param {InspectorHost | { genomeSpy?: any }} host
 * @param {{
 *   container?: HTMLElement,
 *   width?: string,
 *   activePanel?: string
 * }} [options]
 * @returns {Promise<{
 *   element: HTMLElement,
 *   panel: import("./components/inspectorPanel.js").GsInspectorPanel,
 *   session: import("./inspectorSession.js").default,
 *   dispose: () => void
 * }>}
 */
export async function attachInspectorOverlay(host, options = {}) {
    const container = options.container ?? document.body;
    const element = document.createElement("section");
    element.className = "gs-inspector-overlay";
    Object.assign(element.style, {
        position: "fixed",
        top: "0",
        right: "0",
        bottom: "0",
        zIndex: "2147483647",
        width: options.width ?? "min(46vw, 760px)",
        minWidth: "320px",
        maxWidth: "100vw",
        boxShadow: "0 0 18px rgba(0, 0, 0, 0.35)",
        resize: "horizontal",
        overflow: "hidden",
    });

    const inspector = await createInspectorPanel(host, {
        activePanel: options.activePanel,
    });
    Object.assign(inspector.panel.style, {
        display: "block",
        height: "100%",
        minHeight: "0",
    });
    element.append(inspector.panel);
    container.append(element);

    const dispose = () => {
        inspector.dispose();
        element.remove();
    };
    inspector.panel.addEventListener("close", dispose, { once: true });
    await inspector.session.refresh();

    return {
        element,
        panel: inspector.panel,
        session: inspector.session,
        dispose,
    };
}
