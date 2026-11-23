import { LitElement, html, css, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faDesktop,
    faDownload,
    faFolderOpen,
    faEllipsisVertical,
} from "@fortawesome/free-solid-svg-icons";
import { icon as genomeSpyIcon } from "@genome-spy/core";
import { faStyles, playgroundComponentStyles } from "./componentStyles.js";
import { createMenuController } from "@genome-spy/ui-components/contextMenu";
import "@genome-spy/ui-components/contextMenu.css";
import { getRendererLabel, rendererMenuItems } from "./rendererMenu.js";

/** @typedef {import("@genome-spy/ui-components/contextMenu").MenuItem} MenuItem */

class PlaygroundToolbar extends LitElement {
    static properties = {
        actions: { attribute: false },
        exportActions: { attribute: false },
        renderer: { type: String },
        visTitle: { type: String },
        version: { type: String },
        releaseUrl: { type: String },
    };

    constructor() {
        super();
        /** @type {MenuItem[]} */
        this.actions = [];
        /** @type {MenuItem[]} */
        this.exportActions = [];
        /** @type {import("./rendererMenu.js").Renderer} */
        this.renderer = "webgl";
        this.visTitle = "";
        this.version = "";
        this.releaseUrl = "";
    }

    static styles = [
        faStyles,
        playgroundComponentStyles,
        css`
            :host {
                display: block;
                flex-shrink: 0;
            }
            .toolbar {
                background-color: var(--playground-accent);
                color: white;
                box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);

                display: flex;
                align-items: center;

                height: 46px;

                a,
                button,
                span,
                h1 {
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
                }

                .genome-spy-icon img {
                    display: block;
                    height: 40px;

                    transform: rotate(0deg);
                    transition: 0.5s ease-in-out;

                    &:hover {
                        transform: rotate(360deg);
                    }
                }

                > * {
                    margin-left: 10px;
                    display: block;
                    flex-shrink: 0;
                }

                > :last-child {
                    margin-right: 10px;
                }

                > .vis-title {
                    flex-grow: 1;
                    flex-shrink: 1;
                    min-width: 0;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    font-style: italic;
                    font-size: 85%;
                }

                .tool-button {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;

                    color: white;
                    font-size: 0.75rem;
                    border: none;
                    background-color: var(--playground-accent);

                    padding-left: 0.5em;
                    padding-right: 0.5em;

                    margin-left: 0;
                    height: 100%;

                    &:hover {
                        background-color: hsl(
                            from var(--playground-accent) h s calc(l + 5)
                        );
                    }

                    &:disabled {
                        background-color: var(--playground-accent);
                        cursor: default;
                        opacity: 0.55;
                    }

                    &.selected {
                        background-color: hsl(
                            from var(--playground-accent) h s calc(l - 8)
                        );
                    }

                    &:focus {
                        outline: none;
                    }

                    &:focus-visible {
                        outline: 2px solid white;
                        outline-offset: -3px;
                    }

                    svg {
                        font-size: 1rem;
                        margin-bottom: calc(0.2em - 1px);

                        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));

                        + span {
                            margin-left: 0;
                        }
                    }

                    &:active {
                        box-shadow: inset 0 3px 3px rgba(0, 0, 0, 0.1);

                        > * {
                            position: relative;
                            top: 1px;
                        }
                    }
                }

                a {
                    text-decoration: none;
                }

                .title {
                    flex-shrink: 1;
                    min-width: 0;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    font-family: "Medula One", cursive;
                    font-size: 30px;
                    font-weight: normal;
                    margin: 0 10px;
                }

                .version {
                    font-size: 85%;
                    margin-right: 1em;
                }

                .examples-button {
                    margin-right: 10px;
                }

                .toolbar-menu-selector {
                    height: 100%;
                    margin-left: 0;

                    > .tool-button[aria-expanded="true"] {
                        background-color: hsl(
                            from var(--playground-accent) h s calc(l - 8)
                        );
                    }
                }

                .more-selector {
                    display: none;
                }

                @media (max-width: 900px) {
                    .hide-mobile {
                        display: none;
                    }

                    .more-selector {
                        display: block;
                    }
                }
            }
        `,
    ];

    /** @type {ReturnType<typeof createMenuController>} */
    #menu;

    connectedCallback() {
        super.connectedCallback();
        this.#menu = createMenuController({
            mount: this.parentElement,
            lightDismiss: true,
        });
        window.addEventListener("resize", this.#closeHiddenMenu);
    }

    disconnectedCallback() {
        this.#menu.dismissDropdownMenu();
        window.removeEventListener("resize", this.#closeHiddenMenu);
        super.disconnectedCallback();
    }

    updated() {
        const opener = this.#openTrigger;
        if (opener?.disabled) {
            this.#menu.dismissDropdownMenu();
        } else if (opener) {
            this.#showMenu(opener);
        }
    }

    get #openTrigger() {
        return /** @type {HTMLButtonElement | null} */ (
            this.renderRoot.querySelector(
                'button[data-menu][aria-expanded="true"]'
            )
        );
    }

    #closeHiddenMenu = () => {
        const opener = this.#openTrigger;
        // A hidden trigger means the responsive toolbar switched modes.
        if (opener && !opener.getClientRects().length) {
            this.#menu.dismissDropdownMenu();
        }
    };

    /**
     * @param {HTMLButtonElement} opener
     * @param {import("@genome-spy/ui-components/contextMenu").MenuOptions["initialFocus"]} [initialFocus]
     */
    #showMenu(opener, initialFocus = "first") {
        const name = opener.dataset.menu;
        let items = this.exportActions;
        if (name === "renderer") {
            items = rendererMenuItems(this.renderer, (renderer) =>
                this.#selectRenderer(renderer)
            );
            initialFocus = "checked";
        } else if (name === "more") {
            items = [
                ...this.actions.slice(0, 2),
                ...this.exportActions,
                ...this.actions.slice(2),
                {
                    type: "group",
                    label: "Renderer",
                    items: rendererMenuItems(this.renderer, (renderer) =>
                        this.#selectRenderer(renderer)
                    ),
                },
                {
                    label: "Release v" + this.version,
                    type: "link",
                    href: this.releaseUrl,
                    target: "_blank",
                },
            ];
        }

        this.#menu.dropdownMenu(
            {
                label: opener.getAttribute("aria-label"),
                items,
                mode: "command",
                initialFocus,
            },
            opener,
            name === "more" ? "bottom-end" : "bottom-start"
        );
    }

    /**
     * @param {"export" | "renderer" | "more"} name
     * @param {string} label
     * @param {import("@fortawesome/free-solid-svg-icons").IconDefinition} iconDef
     * @param {boolean} [disabled]
     */
    #menuButton(name, label, iconDef, disabled = false) {
        const compact = name === "more";
        const accessibleLabel =
            name === "renderer"
                ? "Renderer: " + getRendererLabel(this.renderer)
                : label;
        return html`
            <div
                class="toolbar-menu-selector ${compact ? "more-selector" : "hide-mobile"}"
            >
                <button
                    type="button"
                    class="tool-button"
                    data-menu=${name}
                    aria-label=${accessibleLabel}
                    title=${accessibleLabel}
                    aria-haspopup="menu"
                    aria-expanded="false"
                    ?disabled=${disabled}
                    @click=${(/** @type {MouseEvent} */ event) => {
                        const opener = /** @type {HTMLButtonElement} */ (
                            event.currentTarget
                        );
                        if (this.#menu.isDropdownOpenFor(opener)) {
                            this.#menu.dismissDropdownMenu();
                        } else {
                            this.#showMenu(opener);
                        }
                    }}
                    @keydown=${(/** @type {KeyboardEvent} */ event) => {
                        if (
                            event.key === "ArrowDown" ||
                            event.key === "ArrowUp"
                        ) {
                            event.preventDefault();
                            this.#showMenu(
                                /** @type {HTMLButtonElement} */ (
                                    event.currentTarget
                                ),
                                event.key === "ArrowUp" ? "last" : "first"
                            );
                        }
                    }}
                >
                    ${icon(iconDef).node[0]}
                    <span>${compact ? label : label + " ▾"}</span>
                </button>
            </div>
        `;
    }

    /** @param {import("./rendererMenu.js").Renderer} renderer */
    #selectRenderer(renderer) {
        this.dispatchEvent(
            new CustomEvent("select-renderer", {
                detail: { renderer },
                bubbles: true,
                composed: true,
            })
        );
    }

    #openExamples() {
        this.dispatchEvent(
            new CustomEvent("open-examples", { bubbles: true, composed: true })
        );
    }

    render() {
        return html`
            <div class="toolbar">
                <a
                    href="https://genomespy.app/"
                    target="_blank"
                    class="genome-spy-icon"
                >
                    <img
                        title="GenomeSpy"
                        alt="GenomeSpy"
                        src="${genomeSpyIcon}"
                    />
                </a>
                <h1 class="title">GenomeSpy Playground</h1>
                ${this.actions.slice(0, 2).map(toolbarAction)}
                ${this.#menuButton(
                    "export",
                    "Export",
                    faDownload,
                    this.exportActions.every((action) => action.disabled)
                )}
                ${this.#menuButton("renderer", "Renderer", faDesktop)}
                ${this.actions.slice(2).map(toolbarAction)}
                <span class="vis-title">
                    <span class="hide-mobile">${this.visTitle}</span>
                </span>
                <a
                    class="version tool-button hide-mobile"
                    href=${this.releaseUrl}
                    >v${this.version}</a
                >
                <button
                    @click=${() => this.#openExamples()}
                    class="tool-button examples-button"
                    aria-haspopup="dialog"
                >
                    ${icon(faFolderOpen).node[0]}
                    <span>Examples</span>
                </button>
                ${this.#menuButton("more", "More", faEllipsisVertical)}
            </div>
        `;
    }
}

/** @param {MenuItem} action */
function toolbarAction(action) {
    const content = html`${action.icon ? icon(action.icon).node[0] : nothing}
        <span>${action.label}</span>`;

    if (action.type === "link") {
        return html`<a
            class="tool-button hide-mobile"
            href=${action.href}
            target=${action.target ?? nothing}
            >${content}</a
        >`;
    }

    const checked = action.type === "checkbox" ? action.checked : undefined;
    return html`<button
        type="button"
        class="tool-button hide-mobile${checked ? " selected" : ""}"
        aria-pressed=${checked ?? nothing}
        ?disabled=${action.disabled}
        @click=${action.callback}
    >
        ${content}
    </button>`;
}

customElements.define("gs-playground-toolbar", PlaygroundToolbar);
