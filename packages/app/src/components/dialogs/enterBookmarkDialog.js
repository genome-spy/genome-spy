import { css, html } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faInfoCircle,
    faShare,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../generic/baseDialog.js";
import { createInputListener } from "./saveImageDialog.js";
import { showMessageDialog } from "../generic/messageDialog.js";

/** @param {unknown} str */
function trimString(str) {
    if (str !== undefined && str !== null) {
        const s = String(str).trim();
        if (s.length) return s;
    }
    return undefined;
}

export default class EnterBookmarkDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        bookmarkDatabase: {},
        bookmark: {},
        mode: { type: String },
        originalName: {},
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: 500px;
            }
        `,
    ];

    constructor() {
        super();
        this.bookmarkDatabase = null;
        this.bookmark = null;
        /** @type {"add" | "edit" | "share"} */
        this.mode = "add";
        this.originalName = undefined;
        this.dialogTitle = "";
    }

    /**
     * @param {Map<string, any>} changed
     */
    willUpdate(changed) {
        if (changed.has("mode")) {
            this.dialogTitle =
                {
                    add: "Add bookmark",
                    edit: "Edit bookmark",
                    share: "Share the current view state as a bookmark",
                }[this.mode] ?? "Bookmark";
        }
    }

    renderBody() {
        /** @type {any} */
        const bookmark = this.bookmark ?? {};
        const mode = this.mode;

        return html`
            ${mode == "edit"
                ? html`<div class="gs-alert warning">
                      ${icon(faExclamationCircle).node[0]} The current
                      visualization state will be updated to the bookmark you
                      are editing.
                  </div>`
                : undefined}
            ${mode == "share"
                ? html`<div class="gs-alert info">
                      ${icon(faInfoCircle).node[0]}<span
                          >You can add an optional title and notes, which will
                          be shown to the recipient when the bookmark link is
                          opened.</span
                      >
                  </div>`
                : undefined}

            <div class="gs-form-group">
                <label for="bookmark-title">Title</label>
                <input
                    autofocus
                    id="bookmark-title"
                    type="text"
                    ?required=${mode == "add" || mode == "edit"}
                    .value=${bookmark.name ?? ""}
                    .placeholder=${mode == "share"
                        ? "Add an optional title"
                        : ""}
                    @change=${createInputListener((input) => {
                        this.bookmark.name = trimString(input.value);
                    })}
                />
            </div>

            <div class="gs-form-group">
                <label for="bookmark-notes">Notes</label>
                <textarea
                    id="bookmark-notes"
                    rows="4"
                    .value=${bookmark.notes ?? ""}
                    .placeholder=${mode == "share" ? "... and notes" : ""}
                    @change=${createInputListener((input) => {
                        this.bookmark.notes = trimString(input.value);
                    })}
                ></textarea>
                <small
                    >Notes will be shown when the bookmark is loaded. You can
                    use
                    <a
                        href="https://www.markdownguide.org/basic-syntax/"
                        target="_blank"
                        rel="noopener"
                        >markdown</a
                    >
                    for formatting.</small
                >
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.onCloseButtonClick()),
            this.mode == "share"
                ? this.makeButton("Make a link", () => this.#onOk(), faShare)
                : this.makeButton("Save", () => this.#onOk()),
        ];
    }

    async #onOk() {
        const bookmark = this.bookmark;
        const mode = this.mode;

        if (mode != "share" && !bookmark.name) {
            await showMessageDialog("Name is missing!", { type: "warning" });
            return true;
        }

        let ok = true;
        try {
            if (
                this.bookmarkDatabase &&
                !(mode && bookmark.name == this.originalName) &&
                (await this.bookmarkDatabase.get(bookmark.name))
            ) {
                ok = await showMessageDialog(
                    html`A bookmark with the name
                        <em>${bookmark.name}</em> already exists. It will be
                        overwritten.`,
                    {
                        title: "Bookmark already exists",
                        confirm: true,
                        type: "warning",
                    }
                );
            }
        } catch (e) {
            console.warn(e);
        }

        if (ok) {
            this.finish({ ok: true });
        } else {
            return true;
        }
    }
}

customElements.define("gs-enter-bookmark-dialog", EnterBookmarkDialog);

/**
 * Show enter-bookmark dialog and resolve to true when saved
 * @param {import("../../bookmark/bookmarkDatabase.js").default} bookmarkDatabase
 * @param {import("../../bookmark/databaseSchema.js").BookmarkEntry} bookmark
 * @param {"add" | "edit" | "share"} mode
 * @returns {Promise<boolean>}
 */
export function showEnterBookmarkInfoDialog(bookmarkDatabase, bookmark, mode) {
    return showDialog(
        "gs-enter-bookmark-dialog",
        /** @param {EnterBookmarkDialog} el */ (el) => {
            el.bookmarkDatabase = bookmarkDatabase;
            el.bookmark = bookmark;
            el.mode = mode;
            el.originalName = bookmark.name;
        }
    ).then(
        (
            /** @type {import("../generic/baseDialog.js").DialogFinishDetail} */ e
        ) => {
            return !!e.ok;
        }
    );
}
