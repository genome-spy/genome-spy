import { html, LitElement, nothing } from "lit";
import { until } from "lit/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faTrash,
    faPen,
    faShare,
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "../utils/ui/dropdown.js";
import { messageBox } from "../utils/ui/modal.js";
import { dropdownMenu, menuItemToTemplate } from "../utils/ui/contextMenu.js";
import { queryDependency } from "../utils/dependency.js";
import { restoreBookmarkAndShowInfoBox } from "../bookmark/bookmark.js";
import { showEnterBookmarkInfoDialog } from "./dialogs/enterBookmarkDialog.js";
import { showShareBookmarkDialog } from "./dialogs/shareBookmarkDialog.js";

class BookmarkButton extends LitElement {
    constructor() {
        super();

        /** @type {import("../app.js").default} */
        this.app = undefined;
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../app.js").default} */ app) => {
                    this.app = app;
                }
            )
        );
    }

    createRenderRoot() {
        return this;
    }

    #createBookmarkWithCurrentState() {
        /** @type {import("../bookmark/databaseSchema.js").BookmarkEntry} */
        const bookmark = {
            name: undefined,
            timestamp: Date.now(),
            actions: this.app.provenance.getBookmarkableActionHistory(),
            scaleDomains: {},
        };

        const viewSettings = this.app.store.getState().viewSettings;
        if (Object.keys(viewSettings.visibilities).length) {
            bookmark.viewSettings = viewSettings;
        }

        for (const [scaleName, scaleResolution] of this.app.genomeSpy
            .getNamedScaleResolutions()
            .entries()) {
            if (scaleResolution.isZoomable()) {
                // TODO: Check if it's the initial zoom level
                // Could be optimized in the bookmark entry
                bookmark.scaleDomains[scaleName] =
                    scaleResolution.getComplexDomain();
            }
        }

        return bookmark;
    }

    async #shareCurrentState() {
        const bookmark = this.#createBookmarkWithCurrentState();
        if (await showEnterBookmarkInfoDialog(undefined, bookmark, "share")) {
            showShareBookmarkDialog(bookmark, false);
        }
    }

    /**
     * @param {import("../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
     * @param {string} [name] Name of an existing entry that will be updated
     */
    async #addBookmark(bookmarkDatabase, name) {
        const existingBookmark = name
            ? await bookmarkDatabase.get(name)
            : undefined;

        const editing = !!existingBookmark;

        const bookmark = this.#createBookmarkWithCurrentState();

        bookmark.name ??= existingBookmark?.name;
        bookmark.notes ??= existingBookmark?.notes;

        if (
            await showEnterBookmarkInfoDialog(
                bookmarkDatabase,
                bookmark,
                editing ? "edit" : "add"
            )
        ) {
            try {
                await bookmarkDatabase.put(bookmark, existingBookmark?.name);
                this.requestUpdate();
            } catch (error) {
                messageBox(`${error}`, { title: "Cannot save the bookmark!" });
            }
        }
    }

    /**
     *
     * @param {import("../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
     * @param {string} name
     */
    async #loadBookmark(bookmarkDatabase, name) {
        const entry = await bookmarkDatabase.get(name);
        if (entry) {
            restoreBookmarkAndShowInfoBox(entry, this.app, {
                database: bookmarkDatabase,
            });
        }
    }

    /**
     * @param {import("../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
     * @param {string} name
     * @param {MouseEvent} event
     */
    #createContextMenu(bookmarkDatabase, name, event) {
        event.stopPropagation();

        const opener = /** @type {HTMLElement} */ (event.target).closest("li");

        const deleteCallback = () =>
            messageBox(html`The bookmark <em>${name}</em> will be deleted.`, {
                title: "Are you sure?",
                cancelButton: true,
            }).then(async (confirmed) => {
                if (confirmed) {
                    await bookmarkDatabase.delete(name);
                    this.requestUpdate();
                }
            });

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        const global = bookmarkDatabase == this.app.globalBookmarkDatabase;

        if (!global) {
            items.push({
                label: "Edit and replace...",
                icon: faPen,
                callback: () => this.#addBookmark(bookmarkDatabase, name),
            });
            items.push({
                label: "Delete",
                icon: faTrash,
                callback: deleteCallback,
            });
        }

        items.push({
            label: "Share...",
            icon: faShare,
            callback: async () =>
                showShareBookmarkDialog(
                    await bookmarkDatabase.get(name),
                    global
                ),
        });

        dropdownMenu({ items }, opener, "right-start");
    }

    /**
     * @param {import("../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
     * @param {string} databaseTitle
     */
    async #makeBookmarkMenuItems(bookmarkDatabase, databaseTitle) {
        const names = await bookmarkDatabase.getNames();

        const items = names.map((name) => ({
            label: name,
            callback: () => this.#loadBookmark(bookmarkDatabase, name),
            ellipsisCallback: (/** @type {MouseEvent} */ event) =>
                this.#createContextMenu(bookmarkDatabase, name, event),
        }));
        return items.length
            ? /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */ ([
                  { type: "divider" },
                  { label: databaseTitle, type: "header" },
                  ...items,
              ]).map((item) => menuItemToTemplate(item))
            : nothing;
    }

    #getBookmarks() {
        /**
         * @param {import("../bookmark/bookmarkDatabase.js").default} db
         * @param {string} title
         */
        const makeTemplate = (db, title) =>
            db
                ? until(
                      this.#makeBookmarkMenuItems(db, title),
                      html`Loading...`
                  )
                : nothing;

        return [
            makeTemplate(
                this.app.globalBookmarkDatabase,
                "Bookmarks on the server"
            ),
            makeTemplate(
                this.app.localBookmarkDatabase,
                "Bookmarks in the web browser"
            ),
        ];
    }

    render() {
        const localBookmarkDb = this.app.localBookmarkDatabase;

        const add = localBookmarkDb
            ? html` <li>
                  <a @click=${() => this.#addBookmark(localBookmarkDb)}
                      >Add bookmark...</a
                  >
              </li>`
            : nothing;

        const bookmarkButtonTemplate =
            localBookmarkDb || this.app.globalBookmarkDatabase
                ? html`
                      <div class="dropdown bookmark-dropdown">
                          <button
                              class="tool-btn"
                              title="Bookmarks"
                              @click=${(/** @type {MouseEvent} */ event) => {
                                  if (toggleDropdown(event)) {
                                      // TODO: Use redux actions to save bookmarks
                                      this.requestUpdate();
                                  }
                              }}
                          >
                              ${icon(faBookmark).node[0]}
                          </button>
                          <ul class="gs-dropdown-menu">
                              ${add} ${this.#getBookmarks()}
                          </ul>
                      </div>
                  `
                : nothing;

        return html`
            <div class="btn-group">
                ${bookmarkButtonTemplate}
                <button
                    class="tool-btn"
                    title="Share"
                    @click=${() => this.#shareCurrentState()}
                >
                    ${icon(faShare).node[0]}
                </button>
            </div>
        `;
    }
}

customElements.define("genome-spy-bookmark-button", BookmarkButton);
