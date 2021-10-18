import { html, LitElement, nothing, render } from "lit";
import { until } from "lit/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faBookmark } from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "./dropdown";
import { createModal, messageBox } from "../utils/ui/modal";
import safeMarkdown from "../utils/safeMarkdown";

class BookmarkButton extends LitElement {
    constructor() {
        super();

        /** @type {import("../genomeSpy").default} */
        this.genomeSpy = undefined;

        /** @type {import("./sampleHandler").default} */
        this.sampleHandler = undefined;

        /** @type {import("../view/sampleView/sampleView").default} */
        this.sampleView = undefined;

        /** @type {import("./bookmarkDatabase").default} */
        this.bookmarkDatabase = undefined;
    }

    static get properties() {
        // TODO: Use event-based dependency injection or something to get access to these
        return {
            genomeSpy: { type: Object },
            sampleHandler: { type: Object },
            sampleView: { type: Object },
            bookmarkDatabase: { type: Object },
        };
    }

    createRenderRoot() {
        return this;
    }

    get _provenance() {
        return this.sampleHandler?.provenance;
    }

    _addBookmark() {
        /** @type {import("./databaseSchema").BookmarkEntry} */
        const bookmarkEntry = {
            name: undefined,
            timestamp: Date.now(),
            actions: this._provenance.getActionHistory(),
            scaleDomains: {},
        };

        for (const [name, scaleResolution] of this.genomeSpy
            .getNamedScaleResolutions()
            .entries()) {
            if (scaleResolution.isZoomable()) {
                // TODO: Check if it's the initial zoom level
                bookmarkEntry.scaleDomains[name] =
                    scaleResolution.getComplexDomain();
            }
        }

        const modal = createModal();

        const save = () => {
            if (bookmarkEntry.name) {
                this.bookmarkDatabase.add(bookmarkEntry).then(() => {
                    modal.close();
                    this.requestUpdate();
                });
            } else {
                alert("Name is missing!");
            }
        };

        const template = html`
            <div class="modal-title">Add bookmark</div>

            <div class="modal-body" style="width: 400px">
                <div class="gs-form-group">
                    <label for="bookmark-title">Title</label>
                    <input
                        id="bookmark-title"
                        type="text"
                        required
                        value=${bookmarkEntry.name}
                        @change=${(/** @type {any} */ event) => {
                            bookmarkEntry.name = event.target.value;
                        }}
                    />
                </div>

                <div class="gs-form-group">
                    <label for="bookmark-notes">Notes</label>
                    <textarea
                        id="bookmark-notes"
                        rows="3"
                        value=${bookmarkEntry.notes}
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
        const entry = await this.bookmarkDatabase.get(name);
        if (entry) {
            // Return to the initial state
            // TODO: listeners should be suppressed during the visit to the initial state
            this._provenance.activateState(0);

            try {
                this.sampleHandler.dispatchBatch(entry.actions);

                /** @type {Promise<void>[]} */
                const promises = [];
                for (const [name, scaleDomain] of Object.entries(
                    entry.scaleDomains ?? {}
                )) {
                    const scaleResolution = this.genomeSpy
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
                this._provenance.activateState(0);
            }
        }
    }

    _getBookmarks() {
        return until(
            this.bookmarkDatabase.getNames().then((names) =>
                names.map(
                    (name) =>
                        html`
                            <li>
                                <a @click=${() => this._loadBookmark(name)}
                                    >${name}</a
                                >
                            </li>
                        `
                )
            ),
            html` Loading... `
        );
    }

    render() {
        if (!this.bookmarkDatabase) {
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
                <ul class="dropdown-menu context-menu">
                    <li>
                        <a
                            @click=${this._addBookmark}
                            ?disabled=${this._provenance.isAtInitialState()}
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
