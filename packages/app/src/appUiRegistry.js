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

    #emitChange() {
        this.dispatchEvent(new Event("change"));
    }
}
