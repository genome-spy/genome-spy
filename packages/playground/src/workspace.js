import { LitElement, html, css, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFile } from "@fortawesome/free-solid-svg-icons";
import { faStyles, playgroundComponentStyles } from "./componentStyles.js";

/** @typedef {{ filesOpen: boolean, auxiliaryWidth: number, filesHeight: number }} WorkspaceState */

/** Stable editor, binding, and dataset slots with a collapsible Files dock. */
export default class PlaygroundWorkspace extends LitElement {
    static properties = {
        layout: { type: String },
        hasInputBindings: { type: Boolean },
        fileCount: { type: Number },
        missingFiles: { attribute: false },
        viewState: { attribute: false },
    };

    /** @type {ResizeObserver} */
    #observer;

    /** @type {AbortController | undefined} */
    #drag;

    constructor() {
        super();
        this.layout = "vertical";
        this.hasInputBindings = false;
        this.fileCount = 0;
        /** @type {Set<string>} */
        this.missingFiles = new Set();
        /** @type {WorkspaceState} */
        this.viewState = {
            filesOpen: false,
            auxiliaryWidth: 400,
            filesHeight: 300,
        };
        this.#observer = new ResizeObserver(() => this.requestUpdate());
    }

    connectedCallback() {
        super.connectedCallback();
        this.#observer.observe(this);
    }

    disconnectedCallback() {
        this.#observer.disconnect();
        this.#drag?.abort();
        super.disconnectedCallback();
    }

    static styles = [
        faStyles,
        playgroundComponentStyles,
        css`
            :host {
                display: block;
                min-width: 0;
                min-height: 0;
                --rail-size: 28px;
            }

            .workspace {
                height: 100%;
                display: grid;
                grid-template-columns: minmax(0, 1fr) var(--auxiliary-size) var(
                        --rail-size
                    );
                grid-template-rows: fit-content(55%) minmax(0, 1fr);
            }

            [hidden] {
                display: none !important;
            }

            .editor,
            .bindings,
            .files {
                min-width: 0;
                min-height: 0;
            }

            .editor {
                grid-column: 1;
                grid-row: 1 / -1;
                overflow: hidden;
            }
            .bindings {
                grid-column: 2;
                grid-row: 1;
                overflow: auto;
                border-left: 1px solid var(--playground-divider);
            }
            .workspace:not(.files-open) .bindings {
                grid-row: 1 / -1;
            }

            slot {
                display: block;
            }
            .editor > slot,
            .files > slot {
                height: 100%;
            }
            ::slotted(*) {
                height: 100%;
                min-height: 0;
            }
            ::slotted([slot="bindings"]) {
                height: auto;
            }

            .files {
                grid-column: 2;
                grid-row: 2;
                overflow: hidden;
                border-left: 1px solid var(--playground-divider);
            }
            .workspace:not(.has-bindings) .files {
                grid-row: 1 / -1;
            }
            .has-bindings .files {
                border-top: 1px solid var(--playground-divider);
            }

            .rail {
                grid-column: 3;
                grid-row: 1 / -1;
                background: var(--playground-panel);
                border-left: 1px solid var(--playground-divider);
            }
            .files-toggle {
                display: flex;
                align-items: center;
                gap: 6px;
                writing-mode: vertical-rl;
                width: 100%;
                padding: 10px 5px;
                border: 0;
                background: transparent;
                color: var(--playground-muted);
                cursor: pointer;
                font-size: var(--playground-font-small);

                &:hover {
                    background: var(--playground-hover);
                }
                &[aria-expanded="true"] {
                    color: var(--playground-accent-text);
                    background: var(--playground-selected);
                    box-shadow: inset 2px 0 var(--playground-accent);
                }
                &:focus-visible {
                    outline-offset: -2px;
                }
            }
            .count {
                font-variant-numeric: tabular-nums;
            }
            .missing {
                color: var(--playground-danger);
                font-weight: 600;
            }

            .resize-handle {
                grid-column: 2;
                grid-row: 1 / -1;
                justify-self: start;
                width: 7px;
                margin-left: -4px;
                z-index: 1;
                cursor: ew-resize;
                touch-action: none;

                &:hover,
                &:active {
                    background: var(--handle-hover-color);
                }
                &:focus-visible {
                    outline: 2px solid var(--playground-accent);
                    outline-offset: -2px;
                }
            }

            .bottom {
                display: flex;
                flex-direction: column;

                .editor {
                    flex: 1;
                    min-height: var(--editor-min-size);
                }
                .bindings {
                    flex: 0 1 auto;
                    max-height: 35%;
                    border-left: 0;
                    border-top: 1px solid var(--playground-divider);
                }
                .files {
                    flex: 0 0 var(--files-size);
                    border-left: 0;
                    border-top: 1px solid var(--playground-divider);
                }
                &.files-open .bindings {
                    max-height: min(
                        35%,
                        max(
                            0px,
                            calc(
                                100% - var(--files-size) - var(
                                        --editor-min-size
                                    ) - var(--rail-size)
                            )
                        )
                    );
                }
                .rail {
                    flex: 0 0 var(--rail-size);
                    border-left: 0;
                    border-top: 1px solid var(--playground-divider);
                }
                .files-toggle {
                    writing-mode: horizontal-tb;
                    min-height: var(--rail-size);
                    width: auto;
                    padding: 4px 12px;

                    &[aria-expanded="true"] {
                        box-shadow: inset 0 2px var(--playground-accent);
                    }
                }
                .resize-handle {
                    flex: 0 0 5px;
                    width: 100%;
                    min-height: 5px;
                    margin: -2px 0 -3px;
                    cursor: ns-resize;
                }
            }

            @media (pointer: coarse) {
                :host {
                    --rail-size: 44px;
                }
                .resize-handle {
                    width: 11px;
                    margin-left: -6px;
                }
                .bottom .resize-handle {
                    width: 100%;
                    flex-basis: 11px;
                    min-height: 11px;
                    margin: -5px 0 -6px;
                }
            }
        `,
    ];

    get #geometry() {
        // Read current bounds so a resize immediately after a layout switch uses the new limits.
        const { width, height } = this.getBoundingClientRect();
        const bottom = this.layout === "horizontal" || width < 640;
        const railSize = parseFloat(
            getComputedStyle(this).getPropertyValue("--rail-size")
        );
        const editorMinSize = bottom ? Math.min(120, height * 0.35) : 120;
        const bindingsMinSize =
            bottom && this.hasInputBindings ? Math.min(64, height * 0.2) : 0;
        const max = Math.max(
            0,
            (bottom ? height : width) -
                railSize -
                editorMinSize -
                bindingsMinSize
        );
        const min = Math.min(bottom ? 100 : 200, max);
        const preferred = bottom
            ? this.viewState.filesHeight
            : this.viewState.auxiliaryWidth;
        return {
            bottom,
            editorMinSize,
            min,
            max,
            size: Math.max(min, Math.min(preferred, max)),
        };
    }

    render() {
        const { bottom, editorMinSize, min, max, size } = this.#geometry;
        const { filesOpen } = this.viewState;
        const hasAuxiliary = this.hasInputBindings || filesOpen;
        const missing = this.missingFiles.size > 0;
        const label = `Add data files${this.fileCount ? ` (${this.fileCount})` : ""}${missing ? ": missing " + Array.from(this.missingFiles).join(", ") : ""}`;

        return html`
            <div
                class="workspace ${bottom ? "bottom" : "side"} ${filesOpen ? "files-open" : ""} ${this.hasInputBindings ? "has-bindings" : ""}"
                style=${styleMap({ "--editor-min-size": `${editorMinSize}px`, "--auxiliary-size": hasAuxiliary ? `${size}px` : "0px", "--files-size": `${size}px` })}
            >
                <div class="editor"><slot name="editor"></slot></div>
                <div class="bindings" ?hidden=${!this.hasInputBindings}>
                    <slot name="bindings"></slot>
                </div>
                <div
                    class="resize-handle"
                    role="separator"
                    tabindex="0"
                    ?hidden=${bottom ? !filesOpen : !hasAuxiliary}
                    aria-label=${bottom ? "Resize Files panel" : "Resize auxiliary panel"}
                    aria-orientation=${bottom ? "horizontal" : "vertical"}
                    aria-valuemin=${Math.round(min)}
                    aria-valuemax=${Math.round(max)}
                    aria-valuenow=${Math.round(size)}
                    @pointerdown=${this.#startResize}
                    @keydown=${this.#handleResizeKey}
                ></div>
                <section
                    class="files"
                    id="files"
                    aria-label="Files"
                    ?hidden=${!filesOpen}
                >
                    <slot name="files"></slot>
                </section>
                <div class="rail">
                    <button
                        type="button"
                        class="files-toggle"
                        aria-label=${label}
                        aria-controls="files"
                        aria-expanded=${filesOpen}
                        @click=${() => {
                            this.viewState.filesOpen = !filesOpen;
                            this.requestUpdate();
                        }}
                    >
                        ${icon(faFile).node}<span>Add data files</span>
                        ${this.fileCount ? html`<span class="count">${this.fileCount}</span>` : nothing}
                        ${missing ? html`<span class="missing" aria-hidden="true">!</span>` : nothing}
                    </button>
                </div>
            </div>
        `;
    }

    /** @param {number} value */
    #resize(value) {
        const { bottom, min, max } = this.#geometry;
        this.viewState[bottom ? "filesHeight" : "auxiliaryWidth"] = Math.max(
            min,
            Math.min(value, max)
        );
        this.requestUpdate();
    }

    /** @param {PointerEvent} event */
    #startResize(event) {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        const handle = /** @type {HTMLElement} */ (event.currentTarget);
        const { bottom, size } = this.#geometry;
        const position = bottom ? event.clientY : event.clientX;
        const pointerId = event.pointerId;
        handle.setPointerCapture(pointerId);
        this.#drag?.abort();
        this.#drag = new AbortController();
        const { signal } = this.#drag;
        handle.addEventListener(
            "pointermove",
            (next) => {
                if (next.pointerId === pointerId)
                    this.#resize(
                        size + position - (bottom ? next.clientY : next.clientX)
                    );
            },
            { signal }
        );
        const finish = () => this.#drag.abort();
        handle.addEventListener("pointerup", finish, { signal });
        handle.addEventListener("pointercancel", finish, { signal });
        handle.addEventListener("lostpointercapture", finish, { signal });
    }

    /** @param {KeyboardEvent} event */
    #handleResizeKey(event) {
        const { bottom, min, max, size } = this.#geometry;
        const increase = bottom ? "ArrowUp" : "ArrowLeft";
        const decrease = bottom ? "ArrowDown" : "ArrowRight";
        if (![increase, decrease, "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        this.#resize(
            event.key === "Home"
                ? min
                : event.key === "End"
                  ? max
                  : size +
                    (event.shiftKey ? 50 : 10) *
                        (event.key === increase ? 1 : -1)
        );
    }
}

customElements.define("gs-playground-workspace", PlaygroundWorkspace);
