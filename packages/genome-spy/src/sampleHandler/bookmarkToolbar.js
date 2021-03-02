import { html } from "lit-html";
import { until } from "lit-html/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faBookmark } from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "./dropdown";

/**
 *
 * @param {import("./sampleHandler").default} sampleHandler
 */
export default function getBookmarkButtons(sampleHandler) {
    if (!sampleHandler) {
        return "";
    }

    const provenance = sampleHandler.provenance;
    const bookmarkDatabase = sampleHandler.bookmarkDatabase;

    const addBookmark = () => {
        const name = prompt("Please enter a name for the bookmark");
        if (name) {
            sampleHandler.bookmarkDatabase.add(
                name,
                provenance.getActionHistory()
            );
        }
    };

    /** @type {(name: string) => Promise<void>} */
    const loadBookmark = async name => {
        const entry = await bookmarkDatabase.get(name);
        if (entry) {
            // Return to the initial state
            provenance.activateState(0);
            sampleHandler.dispatchBatch(entry.actions);
        }
    };

    // TODO: Don't load upon every render
    const getBookmarks = () =>
        until(
            bookmarkDatabase.getNames().then(names =>
                names.map(
                    name =>
                        html`
                            <li>
                                <a @click=${() => loadBookmark(name)}
                                    >${name}</a
                                >
                            </li>
                        `
                )
            ),
            html`
                Loading...
            `
        );

    // TODO: Need a web component or similar here...
    const bookmarkDropdown = () => html`
        <div class="dropdown bookmark-dropdown">
            <button class="tool-btn" title="Bookmarks" @click=${toggleDropdown}>
                ${icon(faBookmark).node[0]}
            </button>
            <ul class="dropdown-menu context-menu">
                <li>
                    <a
                        @click=${addBookmark}
                        ?disabled=${provenance.isAtInitialState()}
                        >Add bookmark...</a
                    >
                </li>
                ${getBookmarks()}
            </ul>
        </div>
    `;

    return html`
        ${bookmarkDatabase ? bookmarkDropdown() : ""}
    `;
}
