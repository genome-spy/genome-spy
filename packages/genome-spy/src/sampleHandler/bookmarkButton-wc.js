import { html, LitElement, nothing } from "lit";
import { until } from "lit/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faBookmark } from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "./dropdown";

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

        const name = prompt("Please enter a name for the bookmark");
        if (name) {
            bookmarkEntry.name = name;
            this.bookmarkDatabase
                .add(bookmarkEntry)
                .then(() => this.requestUpdate());
        }
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
