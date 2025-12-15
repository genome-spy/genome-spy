import { css, html } from "lit";
import BaseDialog, { showDialog } from "./baseDialog.js";
import { compressToUrlHash } from "../../utils/urlHash.js";
import { handleTabClick } from "../../utils/ui/tabs.js";

/**
 * Dialog for sharing a bookmark as URL or JSON
 */
export default class ShareBookmarkDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        bookmark: {},
        global: { type: Boolean },
    };

    static styles = [
        ...super.styles,
        css`
            .copy-url {
                position: relative;

                button {
                    --color: rgb(66, 127, 240);
                    position: absolute;

                    --pad: 0.4em;
                    right: var(--pad);
                    top: var(--pad);
                    bottom: var(--pad);

                    box-shadow: 0 0 var(--pad) * 0.5 var(--pad) * 0.5 white;
                    border: 1px solid var(--color);
                    border-radius: 3px;
                    color: var(--color);
                    background-color: white;

                    &:hover {
                        color: white;
                        background-color: var(--color);
                    }
                }
            }
        `,
    ];

    constructor() {
        super();
        /** @type {import("./../../bookmark/databaseSchema.js").BookmarkEntry} */
        this.bookmark = null;
        this.global = false;
        this.dialogTitle = "Share Bookmark";
    }

    renderBody() {
        const bookmark = this.bookmark ?? { name: "" };
        const json = JSON.stringify(bookmark, undefined, 2);

        const loc = window.location;
        const url =
            loc.origin +
            loc.pathname +
            loc.search +
            (this.global
                ? "#bookmark:" + bookmark.name.replaceAll(" ", "-")
                : compressToUrlHash(bookmark));

        const copyToClipboard = async () => {
            try {
                await navigator.clipboard.writeText(url);
                this.finish({ ok: true });
                this.triggerClose();
            } catch (e) {
                // keep dialog open and show minimal message (could be improved)
                // fallback: nothing
            }
        };

        return html`
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
                        <small>
                            The bookmark URL contains all the bookmarked data,
                            including the possible notes, which will be shown
                            when the link is opened.
                        </small>
                    </div>
                    <div class="gs-form-group">
                        <textarea id="bookmark-json" style="height: 250px">
${json}</textarea
                        >
                        <small>
                            The JSON-formatted bookmark is currently available
                            for development purposes.
                        </small>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define("gs-share-bookmark-dialog", ShareBookmarkDialog);

/**
 * Show share dialog
 *
 * @param {import("./../../bookmark/databaseSchema.js").BookmarkEntry} bookmark
 * @param {boolean} global
 */
export function showShareBookmarkDialog(bookmark, global) {
    return showDialog(
        "gs-share-bookmark-dialog",
        /** @param {ShareBookmarkDialog} el */ (el) => {
            el.bookmark = bookmark;
            el.global = !!global;
        }
    );
}
