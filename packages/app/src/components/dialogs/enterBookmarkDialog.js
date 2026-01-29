import { css, html } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faInfoCircle,
    faShare,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../generic/baseDialog.js";
import { showMessageDialog } from "../generic/messageDialog.js";
import { FormController } from "../forms/formController.js";
import { formField } from "../forms/formField.js";

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
        bookmarkName: { state: true },
        bookmarkNotes: { state: true },
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
        this.bookmarkName = "";
        this.bookmarkNotes = "";
        this.dialogTitle = "";

        /** @type {FormController} */
        this._form = new FormController(this);
        this._form.defineField("name", {
            valueKey: "bookmarkName",
            validate: () => this.#validateName(),
        });
        this._form.defineField("notes", {
            valueKey: "bookmarkNotes",
            validate: () => null,
        });
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
                    ${formField(this._form, "name")}
                    .placeholder=${mode == "share"
                        ? "Add an optional title"
                        : ""}
                />
                ${this._form.feedback("name")}
            </div>

            <div class="gs-form-group">
                <label for="bookmark-notes">Notes (optional)</label>
                <textarea
                    id="bookmark-notes"
                    rows="4"
                    ${formField(this._form, "notes")}
                    .placeholder=${mode == "share" ? "... and notes" : ""}
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
        const hasErrors = this._form.hasErrors();
        return [
            this.makeButton("Cancel", () => this.onCloseButtonClick()),
            this.mode == "share"
                ? this.makeButton(
                      "Make a link",
                      () => this.#onOk(),
                      faShare,
                      hasErrors
                  )
                : this.makeButton(
                      "Save",
                      () => this.#onOk(),
                      undefined,
                      hasErrors
                  ),
        ];
    }

    async #onOk() {
        const bookmark = this.bookmark;
        const mode = this.mode;

        if (this._form.validateAll()) {
            return true;
        }

        if (!bookmark) {
            throw new Error("Bookmark data is missing.");
        }

        bookmark.name = trimString(this.bookmarkName);
        bookmark.notes = trimString(this.bookmarkNotes);

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

    /**
     * @returns {string | null}
     */
    #validateName() {
        if (this.mode == "share") {
            return null;
        }

        const name = this.bookmarkName.trim();
        if (name.length === 0) {
            return "Name is required.";
        }

        return null;
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
            el.bookmarkName = bookmark.name ?? "";
            el.bookmarkNotes = bookmark.notes ?? "";
            el._form.reset();
        }
    ).then(
        (
            /** @type {import("../generic/baseDialog.js").DialogFinishDetail} */ e
        ) => {
            return !!e.ok;
        }
    );
}
