import { html, LitElement, nothing } from "lit";
import { until } from "lit/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faTrash,
    faPen,
    faShare,
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "../utils/ui/dropdown";
import { messageBox } from "../utils/ui/modal";
import { dropdownMenu, menuItemToTemplate } from "../utils/ui/contextMenu";
import { queryDependency } from "../utils/dependency";
import {
    restoreBookmarkAndShowInfoBox,
    showEnterBookmarkInfoDialog,
    showShareBookmarkDialog,
} from "../bookmark/bookmark";

class BookmarkButton extends LitElement {
    constructor() {
        super();

        /** @type {import("../app").default} */
        this.app = undefined;
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../app").default} */ app) => {
                    this.app = app;
                }
            )
        );
    }

    createRenderRoot() {
        return this;
    }

    /**
     * @param {import("../bookmark/bookmarkDatabase").default} bookmarkDatabase
     * @param {string} [name] Name of an existing entry that will be updated
     */
    async _addBookmark(bookmarkDatabase, name) {
        const existingEntry = name
            ? await bookmarkDatabase.get(name)
            : undefined;

        const editing = !!existingEntry;

        /** @type {import("../bookmark/databaseSchema").BookmarkEntry} */
        const bookmarkEntry = existingEntry
            ? {
                  ...existingEntry,
                  timestamp: Date.now(),
                  actions: this.app.provenance.getBookmarkableActionHistory(),
                  scaleDomains: {},
              }
            : {
                  name: undefined,
                  timestamp: Date.now(),
                  actions: this.app.provenance.getBookmarkableActionHistory(),
                  scaleDomains: {},
              };

        const viewSettings = this.app.storeHelper.state.viewSettings;
        if (Object.keys(viewSettings.visibilities).length) {
            bookmarkEntry.viewSettings = viewSettings;
        }

        for (const [scaleName, scaleResolution] of this.app.genomeSpy
            .getNamedScaleResolutions()
            .entries()) {
            if (scaleResolution.isZoomable()) {
                // TODO: Check if it's the initial zoom level
                // Could be optimized in the bookmark entry
                bookmarkEntry.scaleDomains[scaleName] =
                    scaleResolution.getComplexDomain();
            }
        }

        if (
            await showEnterBookmarkInfoDialog(
                bookmarkDatabase,
                bookmarkEntry,
                editing
            )
        ) {
            try {
                await bookmarkDatabase.put(bookmarkEntry, existingEntry?.name);
                this.requestUpdate();
            } catch (error) {
                messageBox("" + error, "Cannot save the bookmark!");
            }
        }
    }

    /**
     *
     * @param {import("../bookmark/bookmarkDatabase").default} bookmarkDatabase
     * @param {string} name
     */
    async _loadBookmark(bookmarkDatabase, name) {
        const entry = await bookmarkDatabase.get(name);
        if (entry) {
            restoreBookmarkAndShowInfoBox(entry, this.app, {
                database: bookmarkDatabase,
            });
        }
    }

    /**
     * @param {import("../bookmark/bookmarkDatabase").default} bookmarkDatabase
     * @param {string} name
     * @param {MouseEvent} event
     */
    _createContextMenu(bookmarkDatabase, name, event) {
        event.stopPropagation();

        const opener = /** @type {HTMLElement} */ (event.target).closest("li");

        const deleteCallback = () =>
            messageBox(
                html`The bookmark <em>${name}</em> will be deleted.`,
                "Are you sure?",
                true
            ).then(async (confirmed) => {
                if (confirmed) {
                    await bookmarkDatabase.delete(name);
                    this.requestUpdate();
                }
            });

        const items = [
            {
                label: "Edit and replace...",
                icon: faPen,
                callback: () => this._addBookmark(bookmarkDatabase, name),
            },
            {
                label: "Delete",
                icon: faTrash,
                callback: deleteCallback,
            },
            {
                label: "Share...",
                icon: faShare,
                callback: async () =>
                    showShareBookmarkDialog(await bookmarkDatabase.get(name)),
            },
        ];

        dropdownMenu({ items }, opener, "right-start");
    }

    /**
     * @param {import("../bookmark/bookmarkDatabase").default} bookmarkDatabase
     * @param {string} databaseTitle
     */
    async _makeBookmarkMenuItems(bookmarkDatabase, databaseTitle) {
        const names = await bookmarkDatabase.getNames();

        const items = names.map((name) => ({
            label: name,
            callback: () => this._loadBookmark(bookmarkDatabase, name),
            ellipsisCallback: bookmarkDatabase.isReadonly()
                ? undefined
                : (/** @type {MouseEvent} */ event) =>
                      this._createContextMenu(bookmarkDatabase, name, event),
        }));
        return items.length
            ? /** @type {import("../utils/ui/contextMenu").MenuItem[]} */ ([
                  { type: "divider" },
                  { label: databaseTitle, type: "header" },
                  ...items,
              ]).map((item) => menuItemToTemplate(item))
            : nothing;
    }

    _getBookmarks() {
        /**
         * @param {import("../bookmark/bookmarkDatabase").default} db
         * @param {string} title
         */
        const makeTemplate = (db, title) =>
            db
                ? until(
                      this._makeBookmarkMenuItems(db, title),
                      html`Loading...`
                  )
                : nothing;

        return [
            makeTemplate(this.app.remoteBookmarkDatabase, "Remote bookmarks"),
            makeTemplate(this.app.localBookmarkDatabase, "Local bookmarks"),
        ];
    }

    render() {
        const localBookmarkDb = this.app.localBookmarkDatabase;

        if (!localBookmarkDb && !this.app.remoteBookmarkDatabase) {
            return nothing;
        }

        const add = localBookmarkDb
            ? html` <li>
                  <a @click=${() => this._addBookmark(localBookmarkDb)}
                      >Add bookmark...</a
                  >
              </li>`
            : nothing;

        return html`
            <div class="dropdown bookmark-dropdown">
                <button
                    class="tool-btn"
                    title="Bookmarks"
                    @click=${toggleDropdown}
                >
                    ${icon(faBookmark).node[0]}
                </button>
                <ul class="gs-dropdown-menu">
                    ${add} ${this._getBookmarks()}
                </ul>
            </div>
        `;
    }
}

customElements.define("genome-spy-bookmark-button", BookmarkButton);
