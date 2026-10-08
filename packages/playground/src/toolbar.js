import { LitElement, html, css } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faFolderOpen,
    faEllipsisVertical,
} from "@fortawesome/free-solid-svg-icons";
import { icon as genomeSpyIcon } from "@genome-spy/core";
import { faStyles, playgroundComponentStyles } from "./componentStyles.js";
import { toolbarAction, toolbarMenu, positionMenu } from "./toolbarMenu.js";
import { rendererMenu, rendererMenuItems } from "./rendererMenu.js";

class PlaygroundToolbar extends LitElement {
    static properties = {
        actions: { attribute: false },
        renderer: { type: String },
        visTitle: { type: String },
        version: { type: String },
        releaseUrl: { type: String },
    };

    constructor() {
        super();
        /** @type {import("./toolbarMenu.js").ToolbarAction[]} */
        this.actions = [];
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

                    &:has(:popover-open) > .tool-button {
                        background-color: hsl(
                            from var(--playground-accent) h s calc(l - 8)
                        );
                    }
                }

                .more-selector {
                    display: none;
                }

                .toolbar-menu {
                    box-sizing: border-box;
                    position: fixed;
                    inset: auto;
                    margin: 0;
                    padding: 0.3rem;
                    border: 1px solid var(--playground-border);
                    border-radius: var(--playground-radius);
                    background: var(--playground-surface);
                    color: var(--playground-text);
                    box-shadow: var(--playground-shadow);
                    max-width: calc(100vw - 8px);
                    max-height: calc(100dvh - 54px);
                    overflow: auto;

                    button,
                    a {
                        display: flex;
                        align-items: center;
                        width: 100%;
                        gap: 0.5rem;
                        padding: 0.5rem 0.6rem;
                        border: none;
                        border-radius: var(--playground-radius);
                        background: transparent;
                        color: inherit;
                        font-size: 0.85rem;
                        text-align: left;
                        cursor: pointer;
                        box-sizing: border-box;

                        &:disabled {
                            opacity: 0.55;
                            cursor: default;
                        }

                        &:hover,
                        &:focus-visible {
                            background: var(--playground-selected);
                            outline: 2px solid var(--playground-accent);
                            outline-offset: -2px;
                        }
                    }

                    button,
                    a,
                    span {
                        text-shadow: none;
                    }

                    svg {
                        width: 1em;
                    }

                    [role="menuitemcheckbox"][aria-checked="true"]::after {
                        content: "✓";
                        margin-left: auto;
                    }

                    .renderer-group {
                        border-block: 1px solid var(--playground-border);
                        margin-block: 0.3rem;
                        padding-block: 0.3rem;
                    }

                    .menu-heading {
                        padding: 0.3rem 0.6rem;
                        color: var(--playground-muted);
                        font-size: 0.75rem;
                    }

                    .renderer-check {
                        width: 1em;
                        color: var(--playground-accent-text);
                    }
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

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener("resize", this.#resizeMenus);
    }

    disconnectedCallback() {
        window.removeEventListener("resize", this.#resizeMenus);
        super.disconnectedCallback();
    }

    #resizeMenus = () => {
        for (const menu of this.renderRoot.querySelectorAll(
            ".toolbar-menu:popover-open"
        )) {
            // A hidden invoker means the responsive toolbar switched modes.
            // Visible menus follow their invoker, including ones just opened.
            if (menu.previousElementSibling.getClientRects().length === 0) {
                /** @type {HTMLElement} */ (menu).hidePopover();
            } else {
                positionMenu(/** @type {HTMLElement} */ (menu));
            }
        }
    };

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
                ${this.actions.slice(0, 3).map((action) => toolbarAction(action, false))}
                ${rendererMenu(this.renderer, (renderer) => this.#selectRenderer(renderer))}
                ${this.actions.slice(3).map((action) => toolbarAction(action, false))}
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
                >
                    ${icon(faFolderOpen).node[0]}
                    <span>Examples</span>
                </button>
                ${toolbarMenu({
                    id: "more-menu",
                    label: "More",
                    className: "more-selector",
                    buttonContent: html`${icon(faEllipsisVertical).node[0]}<span
                            >More</span
                        >`,
                    items: html`
                        ${this.actions.map((action) => toolbarAction(action, true))}
                        <div
                            role="group"
                            aria-label="Renderer"
                            class="renderer-group"
                        >
                            <div class="menu-heading">Renderer</div>
                            ${rendererMenuItems(this.renderer, (renderer) => this.#selectRenderer(renderer))}
                        </div>
                        ${toolbarAction(
                            {
                                label: "Release v" + this.version,
                                href: this.releaseUrl,
                            },
                            true
                        )}
                    `,
                })}
            </div>
        `;
    }
}

customElements.define("gs-playground-toolbar", PlaygroundToolbar);
