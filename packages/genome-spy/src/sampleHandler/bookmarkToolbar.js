import { html } from "lit-html";
import { until } from "lit-html/directives/until.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faBookmark } from "@fortawesome/free-solid-svg-icons";
import { toggleDropdown } from "./dropdown";

/**
 *
 * @param {import("./sampleHandler").default} sampleHandler
 * @param {import("./bookmarkDatabase").default} bookmarkDatabase
 * @param {function():void} render TODO: Use web components
 */
export default function getBookmarkButtons(
    sampleHandler,
    bookmarkDatabase,
    render
) {
    const provenance = sampleHandler.provenance;

    const addBookmark = () => {
        const name = prompt("Please enter a name for the bookmark");
        if (name) {
            bookmarkDatabase
                .add(name, provenance.getActionHistory())
                .then(render);
        }
    };

    /** @type {(name: string) => Promise<void>} */
    const loadBookmark = async name => {
        const entry = await bookmarkDatabase.get(name);
        if (entry) {
            // Return to the initial state
            // TODO: listeners should be suppressed during the visit to the initial state
            provenance.activateState(0);

            try {
                sampleHandler.dispatchBatch(entry.actions);
            } catch (e) {
                console.error(e);
                alert(`Cannot restore bookmark:\n${e}`);
                provenance.activateState(0);
            }
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
