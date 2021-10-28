import { html, LitElement, nothing, render } from "lit";
import { until } from "lit/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faEllipsisV,
    faTrash,
    faPen,
    faExclamationCircle,
} from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "../../utils/ui/dropdown";
import { createModal, messageBox } from "../../utils/ui/modal";
import safeMarkdown from "../../utils/safeMarkdown";
import contextMenu from "../../utils/ui/contextmenu";
import { queryDependency } from "../utils/dependency";

class BookmarkButton extends LitElement {
    constructor() {
        super();

        /** @type {import("../genomeSpyApp").default} */
        this.app = undefined;
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../genomeSpyApp").default} */ app) => {
                    this.app = app;
                }
            )
        );
    }

    createRenderRoot() {
        return this;
    }

    /**
     *
     * @param {string} [name] Name of an existing entry that will be updated
     */
    async _addBookmark(name) {
        const existingEntry = name
            ? await this.app.bookmarkDatabase.get(name)
            : undefined;

        const editing = !!existingEntry;

        /** @type {import("../databaseSchema").BookmarkEntry} */
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

        for (const [scaleName, scaleResolution] of this.app.genomeSpy
            .getNamedScaleResolutions()
            .entries()) {
            if (scaleResolution.isZoomable()) {
                // TODO: Check if it's the initial zoom level
                bookmarkEntry.scaleDomains[scaleName] =
                    scaleResolution.getComplexDomain();
            }
        }

        const isValid = () => !!bookmarkEntry.name;

        const modal = createModal();

        const save = async () => {
            if (!isValid()) {
                messageBox("Name is missing!", "Error");
                return;
            }

            if (
                (await this.app.bookmarkDatabase.get(bookmarkEntry.name)) &&
                !(editing && bookmarkEntry.name == existingEntry.name)
            ) {
                if (
                    !(await messageBox(
                        html`A bookmark with the name
                            <em>${bookmarkEntry.name}</em> already exists. It
                            will be overwritten.`,
                        "Bookmark already exists",
                        true
                    ))
                ) {
                    return;
                }
            }
            try {
                await this.app.bookmarkDatabase.put(
                    bookmarkEntry,
                    existingEntry
                );
                modal.close();
                this.requestUpdate();
            } catch (error) {
                messageBox("" + error, "Cannot save the bookmark!");
            }
        };

        const template = html`
            <div class="modal-title">
                ${editing ? "Edit bookmark" : "Add bookmark"}
            </div>

            <div class="modal-body" style="width: 500px">
                ${editing
                    ? html`
                          <div class="gs-alert warning">
                              ${icon(faExclamationCircle).node[0]} The current
                              visualization state will be updated to the
                              bookmark you are editing.
                          </div>
                      `
                    : nothing}

                <div class="gs-form-group">
                    <label for="bookmark-title">Title</label>
                    <input
                        id="bookmark-title"
                        type="text"
                        required
                        .value=${bookmarkEntry.name ?? ""}
                        @change=${(/** @type {any} */ event) => {
                            bookmarkEntry.name = event.target.value;
                        }}
                    />
                </div>

                <div class="gs-form-group">
                    <label for="bookmark-notes">Notes</label>
                    <textarea
                        id="bookmark-notes"
                        rows="4"
                        .value=${bookmarkEntry.notes ?? ""}
                        @change=${(/** @type {any}} */ event) => {
                            bookmarkEntry.notes = event.target.value.trim();
                        }}
                    ></textarea>
                    <small
                        >Notes will be shown when the bookmark is loaded. You
                        can use
                        <a href="https://www.markdownguide.org/basic-syntax/"
                            >markdown</a
                        >
                        for formatting.</small
                    >
                </div>
            </div>

            <div class="modal-buttons">
                <button @click=${() => modal.close()}>Cancel</button>
                <button @click=${save}>Save</button>
            </div>
        `;

        render(template, modal.content);
        // @ts-expect-error
        modal.content.querySelector("#bookmark-title").focus();
    }

    /** @type {(name: string) => Promise<void>} */
    async _loadBookmark(name) {
        const entry = await this.app.bookmarkDatabase.get(name);
        if (entry) {
            try {
                this.app.provenance.dispatchBookmark(entry.actions);

                /** @type {Promise<void>[]} */
                const promises = [];
                for (const [name, scaleDomain] of Object.entries(
                    entry.scaleDomains ?? {}
                )) {
                    const scaleResolution = this.app.genomeSpy
                        .getNamedScaleResolutions()
                        .get(name);
                    if (scaleResolution) {
                        promises.push(scaleResolution.zoomTo(scaleDomain));
                    } else {
                        console.warn(
                            `Cannot restore scale domain. Unknown name: ${name}`
                        );
                    }
                }
                await Promise.all(promises);

                if (entry.notes?.length) {
                    messageBox(safeMarkdown(entry.notes), entry.name);
                }
            } catch (e) {
                console.error(e);
                alert(`Cannot restore bookmark:\n${e}`);
                this.app.provenance.activateState(0);
            }
        }
    }

    /**
     * @param {string} name
     * @param {MouseEvent} event
     */
    _createContextMenu(name, event) {
        event.stopPropagation();
        contextMenu(
            {
                items: [
                    {
                        label: "Edit and replace",
                        icon: faPen,
                        callback: () => this._addBookmark(name),
                    },
                    {
                        label: "Delete",
                        icon: faTrash,
                        callback: () =>
                            messageBox(
                                html`The bookmark <em>${name}</em> will be
                                    deleted.`,
                                "Are you sure?",
                                true
                            ).then(async (confirmed) => {
                                if (confirmed) {
                                    await this.app.bookmarkDatabase.delete(
                                        name
                                    );
                                    this.requestUpdate();
                                }
                            }),
                    },
                ],
            },
            event
        );
    }

    _getBookmarks() {
        return until(
            this.app.bookmarkDatabase.getNames().then((names) => {
                const items = names.map(
                    (name) =>
                        html`
                            <li>
                                <a @click=${() => this._loadBookmark(name)}
                                    >${name}</a
                                >
                                <a
                                    class="context-menu-ellipsis"
                                    @click=${(
                                        /** @type {MouseEvent} */ event
                                    ) => this._createContextMenu(name, event)}
                                >
                                    ${icon(faEllipsisV).node[0]}
                                </a>
                            </li>
                        `
                );
                return items.length
                    ? [html`<div class="menu-divider"></div>`, ...items]
                    : nothing;
            }),
            html` Loading... `
        );
    }

    render() {
        if (!this.app.bookmarkDatabase) {
            return nothing;
        }

        return html`
            <div class="dropdown bookmark-dropdown">
                <button
                    class="tool-btn"
                    title="Bookmarks"
                    @click=${toggleDropdown}
                >
                    ${icon(faBookmark).node[0]}
                </button>
                <ul class="dropdown-menu gs-context-menu">
                    <li>
                        <a
                            @click=${() => this._addBookmark()}
                            ?disabled=${this.app.provenance.isAtInitialState()}
                            >Add bookmark...</a
                        >
                    </li>
                    ${this._getBookmarks()}
                </ul>
            </div>
        `;
    }
}

customElements.define("genome-spy-bookmark-button", BookmarkButton);
