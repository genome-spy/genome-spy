/**
 * @typedef {object} InspectorHost
 * @prop {() => any | undefined} getViewRoot
 * @prop {() => Promise<typeof import("@genome-spy/core/debug/index.js")>} getModules
 */

/**
 * Creates an embeddable inspector panel with its initial snapshot ready.
 *
 * @param {InspectorHost} host
 * @param {{ activePanel?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<{
 *   panel: import("./components/inspectorPanel.js").GsInspectorPanel,
 *   session: import("./inspectorSession.js").default,
 *   dispose: () => void
 * }>}
 */
export async function createInspectorPanel(host, options = {}) {
    options.signal?.throwIfAborted();
    const [{ default: InspectorSession }, { GsInspectorPanel }] =
        await Promise.all([
            import("./inspectorSession.js"),
            import("./components/inspectorPanel.js"),
        ]);

    options.signal?.throwIfAborted();
    const session = new InspectorSession(host);
    const panel = new GsInspectorPanel();
    panel.session = session;
    if (options.activePanel) {
        panel.activePanel = options.activePanel;
    }

    const dispose = () => {
        options.signal?.removeEventListener("abort", dispose);
        session.dispose();
        panel.remove();
    };
    options.signal?.addEventListener("abort", dispose, { once: true });
    try {
        // The creator owns initialization so loading failures reach its caller.
        await session.refresh();
        options.signal?.throwIfAborted();
    } catch (error) {
        dispose();
        throw error;
    }

    return { panel, session, dispose };
}

/**
 * Attaches the inspector as a fixed-position overlay.
 *
 * @param {InspectorHost} host
 * @param {{
 *   container?: HTMLElement,
 *   width?: string,
 *   activePanel?: string,
 *   signal?: AbortSignal
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
    options.signal?.throwIfAborted();
    const element = container.ownerDocument.createElement("section");
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "GenomeSpy Inspector");
    element.tabIndex = -1;
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
        signal: options.signal,
    });
    Object.assign(inspector.panel.style, {
        display: "block",
        height: "100%",
        minHeight: "0",
    });
    let disposed = false;
    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        options.signal?.removeEventListener("abort", dispose);
        inspector.panel.removeEventListener("close", dispose);
        inspector.dispose();
        element.remove();
    };

    try {
        // Loading the UI or debug helpers can outlive the embed that requested it.
        options.signal?.throwIfAborted();
        options.signal?.addEventListener("abort", dispose, { once: true });
        inspector.panel.addEventListener("close", dispose, { once: true });
        element.append(inspector.panel);
        container.append(element);
    } catch (error) {
        dispose();
        throw error;
    }

    return {
        element,
        panel: inspector.panel,
        session: inspector.session,
        dispose,
    };
}
