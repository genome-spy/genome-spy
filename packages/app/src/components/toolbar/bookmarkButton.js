import { html, LitElement, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faTrash,
    faPen,
    faShare,
} from "@fortawesome/free-solid-svg-icons";
import { showMessageDialog } from "../generic/messageDialog.js";
import {
    dismissDropdownMenu,
    dropdownMenu,
    isDropdownOpenFor,
} from "../../utils/ui/contextMenu.js";
import { queryDependency } from "../../utils/dependency.js";
import { restoreBookmarkAndShowInfoBox } from "../../bookmark/bookmark.js";
import { showEnterBookmarkInfoDialog } from "../dialogs/enterBookmarkDialog.js";
import { showShareBookmarkDialog } from "../dialogs/shareBookmarkDialog.js";
import { createBookmarkWithCurrentState } from "../../bookmark/bookmarkState.js";

class BookmarkButton extends LitElement {
    #bookmarkRequestId = 0;

    constructor() {
        super();

        /** @type {import("../../app.js").default} */
        this.app = undefined;
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../../app.js").default} */ app) => {
                    this.app = app;
                }
            )
        );
    }

    createRenderRoot() {
        return this;
    }

    #createBookmarkWithCurrentState() {
        return createBookmarkWithCurrentState(this.app);
    }

    async #shareCurrentState() {
        const bookmark = this.#createBookmarkWithCurrentState();
        if (await showEnterBookmarkInfoDialog(undefined, bookmark, "share")) {
            showShareBookmarkDialog(bookmark, false);
        }
    }

    /**
     * @param {import("../../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
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
        bookmark.plots ??= existingBookmark?.plots;

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
                showMessageDialog(`${error}`, {
                    title: "Cannot save the bookmark!",
                });
            }
        }
    }

    /**
     *
     * @param {import("../../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
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
     * @param {import("../../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
     * @param {string} name
     */
    #createBookmarkActions(bookmarkDatabase, name) {
        const deleteCallback = () =>
            showMessageDialog(
                html`The bookmark <em>${name}</em> will be deleted.`,
                {
                    title: "Are you sure?",
                    confirm: true,
                }
            ).then(async (confirmed) => {
                if (confirmed) {
                    await bookmarkDatabase.delete(name);
                    this.requestUpdate();
                }
            });

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
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

        return items;
    }

    /**
     * @param {import("../../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
     * @param {string} databaseTitle
     */
    async #makeBookmarkMenuItems(bookmarkDatabase, databaseTitle) {
        const names = await bookmarkDatabase.getNames();

        const items = names.map((name) => ({
            label: name,
            callback: () => this.#loadBookmark(bookmarkDatabase, name),
            ellipsisSubmenu: this.#createBookmarkActions(
                bookmarkDatabase,
                name
            ),
        }));
        return items.length
            ? /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */ ([
                  { type: "divider" },
                  { label: databaseTitle, type: "header" },
                  ...items,
              ])
            : [];
    }

    async #getBookmarks() {
        const sections = await Promise.all([
            this.app.globalBookmarkDatabase
                ? this.#makeBookmarkMenuItems(
                      this.app.globalBookmarkDatabase,
                      "Bookmarks on the server"
                  )
                : [],
            this.app.localBookmarkDatabase
                ? this.#makeBookmarkMenuItems(
                      this.app.localBookmarkDatabase,
                      "Bookmarks in the web browser"
                  )
                : [],
        ]);
        return sections.flat();
    }

    /** @param {MouseEvent} event */
    #handleBookmarksClick(event) {
        const opener = /** @type {HTMLElement} */ (event.currentTarget);
        const requestId = ++this.#bookmarkRequestId;
        if (isDropdownOpenFor(opener)) {
            dismissDropdownMenu();
            return;
        }

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = this.app.localBookmarkDatabase
            ? [
                  {
                      label: "Add bookmark...",
                      callback: () =>
                          this.#addBookmark(this.app.localBookmarkDatabase),
                  },
              ]
            : [];
        const show = (
            /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */ bookmarks
        ) => {
            if (
                requestId === this.#bookmarkRequestId &&
                isDropdownOpenFor(opener)
            ) {
                dropdownMenu(
                    {
                        items: [...items, ...bookmarks],
                        mode: "command",
                        label: "Bookmarks",
                    },
                    opener
                );
            }
        };

        dropdownMenu(
            {
                items: [...items, { label: "Loading..." }],
                mode: "command",
                label: "Bookmarks",
            },
            opener
        );
        void this.#getBookmarks()
            .then(show)
            .catch(() => show([{ label: "Could not load bookmarks." }]));
    }

    render() {
        const localBookmarkDb = this.app.localBookmarkDatabase;

        const bookmarkButtonTemplate =
            localBookmarkDb || this.app.globalBookmarkDatabase
                ? html`
                      <div class="bookmark-dropdown">
                          <button
                              class="tool-btn"
                              title="Bookmarks"
                              aria-haspopup="menu"
                              aria-expanded="false"
                              @click=${this.#handleBookmarksClick}
                          >
                              ${icon(faBookmark).node[0]}
                          </button>
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
