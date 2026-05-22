/**
 * Registry for app-shell UI extensions.
 */
export default class AppUiRegistry extends EventTarget {
    constructor() {
        super();

        /** @type {Set<import("./appTypes.js").ToolbarButtonSpec>} */
        this.toolbarButtons = new Set();

        /** @type {Set<import("./utils/ui/contextMenu.js").MenuItem>} */
        this.toolbarMenuItems = new Set();

        /** @type {HTMLElement | undefined} */
        this.#appShell = undefined;

        /** @type {HTMLElement | undefined} */
        this.#sidePanelHost = undefined;

        /** @type {ResizeObserver | undefined} */
        this.#sidePanelResizeObserver = undefined;
    }

    /**
     * @type {Set<import("./appTypes.js").ToolbarButtonSpec>}
     */
    toolbarButtons;

    /**
     * @type {Set<import("./utils/ui/contextMenu.js").MenuItem>}
     */
    toolbarMenuItems;

    /**
     * @type {Set<HTMLElement>}
     */
    #dockedPanels = new Set();

    /**
     * @type {Map<string, import("./appTypes.js").SidePanelSpec>}
     */
    #sidePanels = new Map();

    /**
     * @type {string | undefined}
     */
    #activeSidePanelId = undefined;

    /**
     * @type {HTMLElement | undefined}
     */
    #appShell;

    /**
     * @type {HTMLElement | undefined}
     */
    #sidePanelHost;

    /**
     * @type {ResizeObserver | undefined}
     */
    #sidePanelResizeObserver;

    /**
     * @param {HTMLElement} appShell
     */
    attachAppShell(appShell) {
        // Panels can be registered before the app shell exists, so keep the
        // shell reference and attach any queued panels here.
        this.#appShell = appShell;
        this.#sidePanelHost =
            appShell.querySelector(".genome-spy-side-panel-host") ??
            this.#createSidePanelHost(appShell);
        if (typeof ResizeObserver === "function") {
            this.#sidePanelResizeObserver?.disconnect();
            this.#sidePanelResizeObserver = new ResizeObserver(() => {
                if (this.#activeSidePanelId) {
                    this.#renderActiveSidePanel();
                }
            });
            this.#sidePanelResizeObserver.observe(appShell);
        }
        for (const panel of this.#dockedPanels) {
            appShell.append(panel);
        }
        this.#renderActiveSidePanel();
    }

    /**
     * @param {import("./appTypes.js").ToolbarButtonSpec} button
     * @returns {() => void}
     */
    registerToolbarButton(button) {
        this.toolbarButtons.add(button);
        this.#emitChange();

        return () => {
            if (this.toolbarButtons.delete(button)) {
                this.#emitChange();
            }
        };
    }

    /**
     * @param {import("./utils/ui/contextMenu.js").MenuItem} item
     * @returns {() => void}
     */
    registerToolbarMenuItem(item) {
        this.toolbarMenuItems.add(item);
        this.#emitChange();

        return () => {
            if (this.toolbarMenuItems.delete(item)) {
                this.#emitChange();
            }
        };
    }

    /**
     * @param {HTMLElement} panel
     * @returns {() => void}
     */
    registerDockedPanel(panel) {
        this.#dockedPanels.add(panel);
        // If the shell is already attached, mount immediately; otherwise the
        // panel will be replayed from attachAppShell().
        if (this.#appShell) {
            this.#appShell.append(panel);
        }
        this.#emitChange();

        return () => {
            if (this.#dockedPanels.delete(panel)) {
                panel.remove();
                this.#emitChange();
            }
        };
    }

    /**
     * @param {import("./appTypes.js").SidePanelSpec} panel
     * @returns {import("./appTypes.js").SidePanelHandle}
     */
    registerSidePanel(panel) {
        this.#sidePanels.set(panel.id, panel);
        this.#renderActiveSidePanel();

        return {
            show: () => {
                this.#activeSidePanelId = panel.id;
                this.#renderActiveSidePanel();
            },
            hide: () => {
                if (this.#activeSidePanelId === panel.id) {
                    this.#activeSidePanelId = undefined;
                    this.#renderActiveSidePanel();
                }
            },
            toggle: () => {
                if (this.#activeSidePanelId === panel.id) {
                    this.#activeSidePanelId = undefined;
                    this.#renderActiveSidePanel();
                    return false;
                }

                this.#activeSidePanelId = panel.id;
                this.#renderActiveSidePanel();
                return true;
            },
            isVisible: () => this.#activeSidePanelId === panel.id,
            dispose: () => {
                if (this.#sidePanels.delete(panel.id)) {
                    if (this.#activeSidePanelId === panel.id) {
                        this.#activeSidePanelId = undefined;
                    }
                    panel.element.remove();
                    this.#renderActiveSidePanel();
                }
            },
        };
    }

    /**
     * @param {HTMLElement} appShell
     * @returns {HTMLElement}
     */
    #createSidePanelHost(appShell) {
        const host = document.createElement("div");
        host.className = "genome-spy-side-panel-host";
        host.hidden = true;
        appShell.append(host);
        return host;
    }

    #renderActiveSidePanel() {
        if (!this.#sidePanelHost) {
            return;
        }

        const activePanel = this.#activeSidePanelId
            ? this.#sidePanels.get(this.#activeSidePanelId)
            : undefined;

        for (const panel of this.#sidePanels.values()) {
            if (panel.element.parentElement !== this.#sidePanelHost) {
                this.#sidePanelHost.append(panel.element);
            }
            panel.element.hidden = panel !== activePanel;
        }

        if (!activePanel) {
            this.#sidePanelHost.hidden = true;
            this.#sidePanelHost.style.removeProperty("width");
            this.#emitChange();
            return;
        }

        this.#sidePanelHost.hidden = false;
        this.#sidePanelHost.style.width =
            activePanel.preferredWidth ?? "min(36vw, 600px)";
        this.#snapSidePanelWidth();
        this.#emitChange();
    }

    #snapSidePanelWidth() {
        if (!this.#sidePanelHost) {
            return;
        }

        const width = Math.round(
            this.#sidePanelHost.getBoundingClientRect().width
        );
        this.#sidePanelHost.style.width = width + "px";
    }

    #emitChange() {
        this.dispatchEvent(new Event("change"));
    }
}
