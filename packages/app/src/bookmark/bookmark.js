import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faChevronDown,
    faExclamationCircle,
    faInfoCircle,
    faShare,
    faStepBackward,
    faStepForward,
} from "@fortawesome/free-solid-svg-icons";
import { html, nothing, render } from "lit";
import { ActionCreators } from "redux-undo";
import safeMarkdown from "../utils/safeMarkdown.js";
import {
    createCloseEvent,
    createModal,
    messageBox,
} from "../utils/ui/modal.js";
import { handleTabClick } from "../utils/ui/tabs.js";
import { compressToUrlHash } from "../utils/urlHash.js";
import { viewSettingsSlice } from "../viewSettingsSlice.js";

/**
 * @typedef {object} BookmarkInfoBoxOptions
 * @prop {import("./bookmarkDatabase.js").default} [database]
 *      An optional bookmark database that contains the entry. Used for next/prev buttons.
 * @prop {"default" | "tour" | "shared"} [mode]
 * @prop {string} [afterTourBookmark] See `RemoteBookmarkConfig`
 */

/**
 * @type {import("../utils/ui/modal.js").Modal}
 */
let infoBox;

/**
 * Resets the provenance and scales to defaults.
 * TODO: Move elsewhere since this could be useful for a "reset" button.
 *
 * @param {import("../app.js").default} app
 */
export function resetToDefaultState(app) {
    for (const scaleResolution of app.genomeSpy
        .getNamedScaleResolutions()
        .values()) {
        if (scaleResolution.isZoomable()) {
            scaleResolution.resetZoom();
        }
    }

    app.storeHelper.dispatch([
        ...(app.provenance.isUndoable() ? [ActionCreators.jumpToPast(0)] : []),
        // clearHistory clears the initial state too. TODO: Come up with something, maybe: https://github.com/omnidan/redux-undo#filtering-actions
        //ActionCreators.clearHistory(),
        viewSettingsSlice.actions.restoreDefaultVisibilities(),
    ]);
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 */
export async function restoreBookmark(entry, app) {
    try {
        if (entry.actions) {
            app.provenance.dispatchBookmark(entry.actions);
        }

        app.storeHelper.dispatch(
            viewSettingsSlice.actions.setViewSettings(entry.viewSettings)
        );

        /** @type {Promise<void>[]} */
        const promises = [];
        for (const [name, scaleDomain] of Object.entries(
            entry.scaleDomains ?? {}
        )) {
            const scaleResolution = app.genomeSpy
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
        messageBox(
            html`<p>Cannot restore the state:</p>
                <p>${e}</p>`
        );
        app.provenance.activateState(0);
    }
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function restoreBookmarkAndShowInfoBox(entry, app, options = {}) {
    await restoreBookmark(entry, app);
    if (
        infoBox ||
        entry.notes ||
        (options.mode == "shared" && (entry.name || entry.notes))
    ) {
        await showBookmarkInfoBox(entry, app, options);
    }
}

/**
 *
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function showBookmarkInfoBox(entry, app, options = {}) {
    infoBox ??= createModal("tour", app.appContainer);

    await updateBookmarkInfoBox(entry, app, options);
}

/**
 *
 * @param {import("./databaseSchema.js").BookmarkEntry} entry
 * @param {import("../app.js").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function updateBookmarkInfoBox(entry, app, options) {
    const db = options.database;

    const names = db ? await db.getNames() : [];

    const entryIndex = names.indexOf(entry.name);

    const of = db ? ` ${entryIndex + 1} of ${names.length}` : "";
    const title = `${
        options.mode == "shared" ? "Shared bookmark" : "Bookmark"
    }${of}: ${entry.name ?? "Unnamed"}`;

    const content = entry.notes
        ? safeMarkdown(entry.notes, {
              // TODO: It's actually the bookmarkDatabase's url that should be used as a baseUrl
              baseUrl: app.genomeSpy.spec.baseUrl,
          })
        : html`<span class="no-notes">No notes provided</span>`;

    const close = async () => {
        infoBox?.close();
        infoBox = undefined;

        if (options.mode == "tour") {
            const atb = options.afterTourBookmark;
            if (typeof atb == "string") {
                const entry = await options.database.get(atb);
                if (!entry) {
                    throw new Error(`No such bookmark: ${atb}`);
                }
                restoreBookmark(entry, app);
            } else if (atb === null) {
                // Do nothing
            } else {
                resetToDefaultState(app);
            }
        }
    };

    const jumpTo = async (/** @type {number} */ index) => {
        // TODO: Prevent double clicks, etc
        const entry = await db.get(names[index]);
        restoreBookmarkAndShowInfoBox(entry, app, options);
        // Transfer focus so that keyboard shortcuts such as peek (e) are handled correctly
        app.appContainer.querySelector("canvas").focus();
    };

    const importBookmark = async () => {
        if (
            await showEnterBookmarkInfoDialog(
                app.localBookmarkDatabase,
                entry,
                "add"
            )
        ) {
            try {
                await app.localBookmarkDatabase.put(entry);
            } catch (e) {
                console.warn(e);
                messageBox(`Cannot import bookmark: ${e}`);
            }
        }
    };

    const buttons = html` <button class="btn" @click=${close}>
            ${options.mode == "tour" ? "End tour" : "Close"}
        </button>
        ${options.mode == "shared" && app.localBookmarkDatabase
            ? html`
                  <button class="btn" @click=${importBookmark}>
                      ${icon(faBookmark).node[0]} Import bookmark
                  </button>
              `
            : nothing}
        ${db
            ? html` <button
                      class="btn"
                      @click=${() => jumpTo(entryIndex - 1)}
                      ?disabled=${entryIndex <= 0}
                  >
                      ${icon(faStepBackward).node[0]} Previous
                  </button>
                  <button
                      class="btn"
                      @click=${() => jumpTo(entryIndex + 1)}
                      ?disabled=${entryIndex >= names.length - 1}
                  >
                      Next ${icon(faStepForward).node[0]}
                  </button>`
            : nothing}`;

    const toggleCollapse = (/** @type {MouseEvent} */ event) =>
        /** @type {HTMLElement} */ (event.target)
            .closest(".gs-modal")
            .classList.toggle("collapsed");

    const template = html`
        <button title="Collapse" class="btn collapse" @click=${toggleCollapse}>
            ${icon(faChevronDown).node[0]}
        </button>
        <div class="modal-title">${title}</div>
        <div class="modal-body markdown" style="max-width: 600px">
            ${content}
        </div>
        <div class="modal-buttons">${buttons}</div>
    `;

    render(template, infoBox.content);
}

/**
 * @param {import("./databaseSchema.js").BookmarkEntry} bookmark
 * @param {boolean} global Is it a remote bookmark that should be shared with a short url
 */
export function showShareBookmarkDialog(bookmark, global) {
    const json = JSON.stringify(bookmark, undefined, 2);

    const loc = window.location;
    const url =
        loc.origin +
        loc.pathname +
        loc.search +
        (global
            ? "#bookmark:" + bookmark.name.replaceAll(" ", "-")
            : compressToUrlHash(bookmark));

    const copyToClipboard = (/** @type {MouseEvent} */ event) =>
        navigator.clipboard
            .writeText(url)
            .then(() => event.target.dispatchEvent(createCloseEvent()))
            .catch(() => messageBox("Failed to copy!"));

    messageBox(
        html`
            <div class="gs-tabs" style="width: 600px">
                <ul class="tabs" @click=${handleTabClick}>
                    <li class="active-tab"><button>URL</button></li>
                    <li><button>JSON</button></li>
                </ul>
                <div class="panes">
                    <div class="gs-form-group active-tab">
                        <label for="bookmark-url">Here's a link for you:</label>
                        <div class="copy-url">
                            <input
                                id="bookmark-url"
                                type="text"
                                .value=${url}
                            />
                            <button @click=${copyToClipboard}>Copy</button>
                        </div>
                        <small
                            >The bookmark URL contains all the bookmarked data,
                            including the possible notes, which will be shown
                            when the link is opened.</small
                        >
                    </div>
                    <div class="gs-form-group">
                        <textarea id="bookmark-json" style="height: 250px">
${json}</textarea
                        >
                        <small
                            >The JSON-formatted bookmark is currently available
                            for development purposes.</small
                        >
                    </div>
                </div>
            </div>
        `,
        { title: "Share a bookmark", okLabel: "Close" }
    );
}

/**
 * @param {import("./bookmarkDatabase.js").default} bookmarkDatabase
 * @param {import("./databaseSchema.js").BookmarkEntry} bookmark
 * @param {"add" | "edit" | "share"} mode
 * @returns {Promise<boolean>} promise that resolves to true when the bookmark was saved
 */
export function showEnterBookmarkInfoDialog(bookmarkDatabase, bookmark, mode) {
    const title = {
        add: "Add bookmark",
        edit: "Edit bookmark",
        share: "Share the current view state as a bookmark",
    }[mode];

    /**
     *
     * @param {() => void} cancelCallback
     * @param {() => void} okCallback
     * @returns
     */
    const makeTemplate = (cancelCallback, okCallback) => html`
        <div class="modal-title">${title}</div>

        <div class="modal-body" style="width: 500px">
            ${mode == "edit"
                ? html`
                      <div class="gs-alert warning">
                          ${icon(faExclamationCircle).node[0]} The current
                          visualization state will be updated to the bookmark
                          you are editing.
                      </div>
                  `
                : nothing}
            ${mode == "share"
                ? html`
                      <div class="gs-alert info">
                          ${icon(faInfoCircle).node[0]}
                          <span
                              >You can add an optional title and notes, which
                              will be shown to the recipient when the bookmark
                              link is opened.</span
                          >
                      </div>
                  `
                : nothing}

            <div class="gs-form-group">
                <label for="bookmark-title">Title</label>
                <input
                    id="bookmark-title"
                    type="text"
                    ?required=${mode == "add" || mode == "edit"}
                    .value=${bookmark.name ?? ""}
                    .placeholder=${mode == "share"
                        ? "Add an optional title"
                        : ""}
                    @change=${(/** @type {any} */ event) => {
                        bookmark.name = trimString(event.target.value);
                    }}
                />
            </div>

            <div class="gs-form-group">
                <label for="bookmark-notes">Notes</label>
                <textarea
                    id="bookmark-notes"
                    rows="4"
                    .value=${bookmark.notes ?? ""}
                    .placeholder=${mode == "share" ? "... and notes" : ""}
                    @change=${(/** @type {any}} */ event) => {
                        bookmark.notes = trimString(event.target.value);
                    }}
                ></textarea>
                <small
                    >Notes will be shown when the bookmark is loaded. You can
                    use
                    <a href="https://www.markdownguide.org/basic-syntax/"
                        >markdown</a
                    >
                    for formatting.</small
                >
            </div>
        </div>

        <div class="modal-buttons">
            <button class="btn btn-cancel" @click=${cancelCallback}>
                Cancel
            </button>
            <button class="btn btn-primary" @click=${okCallback}>
                ${mode == "share"
                    ? html`${icon(faShare).node[0]} Create a link`
                    : "Save"}
            </button>
        </div>
    `;

    const originalName = bookmark.name;

    const isValid = () => !!bookmark.name;

    const modal = createModal();

    return new Promise((resolve) => {
        const cancel = () => {
            modal.close();
            resolve(false);
        };

        const save = async () => {
            if (!isValid()) {
                messageBox("Name is missing!", { title: "Error" });
                return;
            }

            let ok = true;

            if (
                bookmarkDatabase &&
                !(mode && bookmark.name == originalName) &&
                (await bookmarkDatabase.get(bookmark.name))
            ) {
                ok = await messageBox(
                    html`A bookmark with the name
                        <em>${bookmark.name}</em> already exists. It will be
                        overwritten.`,
                    { title: "Bookmark already exists", cancelButton: true }
                );
            }

            if (ok) {
                modal.close();
                resolve(true);
            }
        };

        const share = () => {
            modal.close();
            resolve(true);
        };

        render(
            makeTemplate(cancel, mode == "share" ? share : save),
            modal.content
        );
        // @ts-expect-error
        modal.content.querySelector("#bookmark-title").focus();
    });
}

/**
 * @param {string} str
 */
function trimString(str) {
    if (str !== undefined) {
        str = str.trim();
        if (str.length) {
            return str;
        }
    }
    return undefined;
}
