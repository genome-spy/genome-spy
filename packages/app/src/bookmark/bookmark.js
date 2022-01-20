import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faBookmark,
    faChevronDown,
    faExclamationCircle,
    faStepBackward,
    faStepForward,
} from "@fortawesome/free-solid-svg-icons";
import { html, nothing, render } from "lit";
import safeMarkdown from "../utils/safeMarkdown";
import { createCloseEvent, createModal, messageBox } from "../utils/ui/modal";
import { compressToUrlHash } from "../utils/urlHash";
import { viewSettingsSlice } from "../viewSettingsSlice";

/**
 * @typedef {object} BookmarkInfoBoxOptions
 * @prop {import("./bookmarkDatabase").default} [database]
 *      An optional bookmark database that contains the entry. Used for next/prev buttons.
 * @prop {"default" | "tour" | "shared"} [mode]
 */

/**
 * @type {import("../utils/ui/modal").Modal}
 */
let infoBox;

/**
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
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
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function restoreBookmarkAndShowInfoBox(entry, app, options = {}) {
    await restoreBookmark(entry, app);
    if (entry.notes || infoBox) {
        await showBookmarkInfoBox(entry, app, options);
    }
}

/**
 *
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
 * @param {BookmarkInfoBoxOptions} [options]
 */
export async function showBookmarkInfoBox(entry, app, options = {}) {
    infoBox ??= createModal("tour");

    await updateBookmarkInfoBox(entry, app, options);
}

/**
 *
 * @param {Partial<import("./databaseSchema").BookmarkEntry>} entry
 * @param {import("../app").default} app
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
        ? safeMarkdown(entry.notes)
        : html`<span class="no-notes">No notes provided</span>`;

    const close = () => {
        infoBox?.close();
        infoBox = undefined;
    };

    const jumpTo = async (/** @type {number} */ index) => {
        // TODO: Prevent double clicks, etc
        const entry = await db.get(names[index]);
        restoreBookmarkAndShowInfoBox(entry, app, options);
    };

    const buttons = html` <button @click=${close}>
            ${options.mode == "tour" ? "End tour" : "Close"}
        </button>
        ${options.mode == "shared"
            ? html`
                  <button @click=${() => alert("TODO")}>
                      ${icon(faBookmark).node[0]} Import bookmark
                  </button>
              `
            : nothing}
        ${db
            ? html` <button
                      @click=${() => jumpTo(entryIndex - 1)}
                      ?disabled=${entryIndex <= 0}
                  >
                      ${icon(faStepBackward).node[0]} Previous
                  </button>
                  <button
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
        <button title="Collapse" class="collapse" @click=${toggleCollapse}>
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
 * @param {import("./databaseSchema").BookmarkEntry} bookmark
 */
export function showShareBookmarkDialog(bookmark) {
    const json = JSON.stringify(bookmark, undefined, 2);

    const loc = window.location;
    const url =
        loc.origin + loc.pathname + loc.search + compressToUrlHash(bookmark);

    const copyToClipboard = (/** @type {MouseEvent} */ event) =>
        navigator.clipboard
            .writeText(url)
            .then(() => event.target.dispatchEvent(createCloseEvent()))
            .catch(() => messageBox("Failed to copy!"));

    messageBox(
        html`
            <div style="width: 600px">
                <div class="gs-form-group">
                    <label for="bookmark-url">URL</label>
                    <div class="copy-url">
                        <input id="bookmark-url" type="text" .value=${url} />
                        <button @click=${copyToClipboard}>Copy</button>
                    </div>
                    <small
                        >The bookmark URL contains all the bookmarked data,
                        including the possible notes, which will be shown when
                        the URL is opened.</small
                    >
                </div>
                <div class="gs-form-group">
                    <label for="bookmark-json">JSON</label>
                    <textarea id="bookmark-json" style="height: 250px">
${json}</textarea
                    >
                    <small
                        >The JSON-formatted bookmark is currently available for
                        development purposes.</small
                    >
                </div>
            </div>
        `,
        "Share a bookmark"
    );
}

/**
 * @param {import("./bookmarkDatabase").default} bookmarkDatabase
 * @param {import("./databaseSchema").BookmarkEntry} bookmark
 * @param {boolean} editing
 * @returns {Promise<boolean>} promise that resolves to true when the bookmark was saved
 */
export function showEnterBookmarkInfoDialog(
    bookmarkDatabase,
    bookmark,
    editing
) {
    /**
     *
     * @param {() => void} cancelCallback
     * @param {() => void} okCallback
     * @returns
     */
    const makeTemplate = (cancelCallback, okCallback) => html`
        <div class="modal-title">
            ${editing ? "Edit bookmark" : "Add bookmark"}
        </div>

        <div class="modal-body" style="width: 500px">
            ${editing
                ? html`
                      <div class="gs-alert warning">
                          ${icon(faExclamationCircle).node[0]} The current
                          visualization state will be updated to the bookmark
                          you are editing.
                      </div>
                  `
                : nothing}

            <div class="gs-form-group">
                <label for="bookmark-title">Title</label>
                <input
                    id="bookmark-title"
                    type="text"
                    required
                    .value=${bookmark.name ?? ""}
                    @change=${(/** @type {any} */ event) => {
                        bookmark.name = event.target.value;
                    }}
                />
            </div>

            <div class="gs-form-group">
                <label for="bookmark-notes">Notes</label>
                <textarea
                    id="bookmark-notes"
                    rows="4"
                    .value=${bookmark.notes ?? ""}
                    @change=${(/** @type {any}} */ event) => {
                        bookmark.notes = event.target.value.trim();
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
            <button class="btn-cancel" @click=${cancelCallback}>Cancel</button>
            <button class="btn-primary" @click=${okCallback}>Save</button>
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
                messageBox("Name is missing!", "Error");
                return;
            }

            let ok = true;

            if (
                (await bookmarkDatabase.get(bookmark.name)) &&
                !(editing && bookmark.name == originalName)
            ) {
                ok = await messageBox(
                    html`A bookmark with the name
                        <em>${bookmark.name}</em> already exists. It will be
                        overwritten.`,
                    "Bookmark already exists",
                    true
                );
            }

            if (ok) {
                modal.close();
                resolve(true);
            }
        };

        render(makeTemplate(cancel, save), modal.content);
        // @ts-expect-error
        modal.content.querySelector("#bookmark-title").focus();
    });
}
