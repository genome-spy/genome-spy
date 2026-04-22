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
     * @type {HTMLElement | undefined}
     */
    #appShell;

    /**
     * @param {HTMLElement} appShell
     */
    attachAppShell(appShell) {
        // Panels can be registered before the app shell exists, so keep the
        // shell reference and attach any queued panels here.
        this.#appShell = appShell;
        for (const panel of this.#dockedPanels) {
            appShell.append(panel);
        }
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

    #emitChange() {
        this.dispatchEvent(new Event("change"));
    }
}
