import { LitElement, html, css } from "lit";

/**
 * A resizable split panel component.
 */
class SplitPanel extends LitElement {
    static properties = {
        orientation: { type: String, reflect: true },
        reverse: { type: Boolean, reflect: true },
    };

    /** @type {MutationObserver | undefined} */
    #childrenObserver;

    /** @type {number[]} Percentage of the container occupied by each pane. */
    #sizes = [];

    /** @type {(() => void) | undefined} */
    #endResize;

    constructor() {
        super();
        this.orientation = "horizontal";
        this.reverse = false;
    }

    connectedCallback() {
        super.connectedCallback();

        this.#childrenObserver = new MutationObserver(() => {
            this.#endResize?.();
            this.requestUpdate();
        });
        this.#childrenObserver.observe(this, { childList: true });
    }

    disconnectedCallback() {
        this.#childrenObserver?.disconnect();
        this.#childrenObserver = undefined;
        this.#endResize?.();
        super.disconnectedCallback();
    }

    /** @param {import("lit").PropertyValues} changed */
    willUpdate(changed) {
        if (changed.has("orientation") || changed.has("reverse")) {
            this.#endResize?.();
        }
    }

    static styles = css`
        :host {
            display: block;
            position: relative;
            --border-color: #e0e0e0;
            --handle-hover-color: rgba(255, 0, 0, 0.1);
        }
        .container {
            display: flex;
            position: relative;
            width: 100%;
            height: 100%;
        }
        .resizable {
            position: relative;
            overflow: visible;
            box-sizing: border-box;
        }
        .resizable-slot {
            position: absolute;
            inset: 0;
            overflow: hidden;
        }
        .resizable-handle {
            position: absolute;
            z-index: 10;
            -webkit-user-select: none;
            user-select: none;
        }

        .resizable-handle:hover {
            background-color: var(--handle-hover-color);
        }

        .resizable-handle:focus-visible {
            outline: 2px solid currentColor;
        }

        :host([orientation="horizontal"]) .resizable-handle {
            right: -3px;
            top: 0;
            width: 5px;
            height: 100%;
            cursor: ew-resize;
            touch-action: pan-y pinch-zoom;
        }
        :host([orientation="horizontal"]) .resizable:not(:last-child) {
            border-right: 1px solid var(--border-color);
        }

        :host([orientation="vertical"]) .container {
            flex-direction: column;
        }

        :host([orientation="vertical"]) .resizable-handle {
            right: auto;
            bottom: -3px;
            width: 100%;
            height: 5px;
            cursor: ns-resize;
            touch-action: pan-x pinch-zoom;
        }

        :host([orientation="vertical"]) .resizable:not(:last-child) {
            border-bottom: 1px solid var(--border-color);
        }
        :host(.resizing[orientation="horizontal"]) {
            cursor: ew-resize;
        }
        :host(.resizing[orientation="vertical"]) {
            cursor: ns-resize;
        }

        @media (pointer: coarse) {
            :host([orientation="horizontal"]) .resizable-handle {
                right: -12px;
                width: 24px;
            }
            :host([orientation="vertical"]) .resizable-handle {
                bottom: -12px;
                height: 24px;
            }
        }
    `;

    render() {
        return html`<div class="container">${this.#renderChildren()}</div>`;
    }

    #renderChildren() {
        const children = Array.from(this.children);
        const orderedChildren = this.reverse ? children.reverse() : children;
        if (this.#sizes.length !== children.length) {
            this.#sizes = children.map(() => 100 / children.length);
        }
        return orderedChildren.map((child, index) => {
            const size = this.#sizes[index];
            const pairSize = this.#sizes[index] + this.#sizes[index + 1];
            const paneId = "pane-" + index;

            return html`
                <div
                    class="resizable"
                    id=${paneId}
                    style=${`flex: 0 0 ${size}%`}
                >
                    <slot
                        class="resizable-slot"
                        name=${child.getAttribute("slot")}
                    ></slot>
                    ${
                        index < children.length - 1
                            ? html`<div
                                  class="resizable-handle"
                                  role="separator"
                                  tabindex="0"
                                  aria-label=${child.getAttribute("data-pane-label") ?? `Pane ${index + 1}`}
                                  aria-controls=${paneId}
                                  aria-orientation=${this.orientation === "horizontal" ? "vertical" : "horizontal"}
                                  aria-valuemin="0"
                                  aria-valuemax="100"
                                  aria-valuenow=${pairSize ? Math.round((size / pairSize) * 100) : 0}
                                  @pointerdown=${(
                                      /** @type {PointerEvent} */ e
                                  ) => this.#startResize(e, index)}
                                  @keydown=${(/** @type {KeyboardEvent} */ e) =>
                                      this.#handleResizeKey(e, index)}
                              ></div>`
                            : ""
                    }
                </div>
            `;
        });
    }

    /** @param {number} index @param {number} pairSize @param {number} size */
    #resize(index, pairSize, size) {
        const current = Math.max(0, Math.min(size, pairSize));
        this.#sizes[index] = current;
        this.#sizes[index + 1] = pairSize - current;
        this.requestUpdate();
    }

    /**
     * @param {PointerEvent} event
     * @param {number} index
     */
    #startResize(event, index) {
        if (!event.isPrimary || event.button !== 0 || this.#endResize) return;

        const isHorizontal = this.orientation === "horizontal";
        const { width, height } = this.getBoundingClientRect();
        const panelSize = isHorizontal ? width : height;
        if (!panelSize) return;

        event.preventDefault();
        event.stopPropagation();

        const handle = /** @type {HTMLElement} */ (event.currentTarget);
        const { pointerId } = event;
        const startPosition = isHorizontal ? event.clientX : event.clientY;
        const startSize = this.#sizes[index];
        const pairSize = startSize + this.#sizes[index + 1];
        const controller = new AbortController();
        const { signal } = controller;

        handle.setPointerCapture(pointerId);
        handle.focus({ preventScroll: true });
        this.classList.add("resizing");

        /** @param {PointerEvent} [event] */
        const finish = (event) => {
            if (event && event.pointerId !== pointerId) return;
            controller.abort();
            this.#endResize = undefined;
            this.classList.remove("resizing");
            if (handle.hasPointerCapture(pointerId)) {
                handle.releasePointerCapture(pointerId);
            }
        };
        this.#endResize = finish;

        handle.addEventListener(
            "pointermove",
            (move) => {
                if (move.pointerId !== pointerId) return;
                const position = isHorizontal ? move.clientX : move.clientY;
                const delta = ((position - startPosition) / panelSize) * 100;
                this.#resize(index, pairSize, startSize + delta);
                move.stopPropagation();
            },
            { signal }
        );
        for (const type of [
            "pointerup",
            "pointercancel",
            "lostpointercapture",
        ]) {
            handle.addEventListener(type, finish, { signal });
        }
    }

    /** @param {KeyboardEvent} event @param {number} index */
    #handleResizeKey(event, index) {
        const isHorizontal = this.orientation === "horizontal";
        const increase = isHorizontal ? "ArrowRight" : "ArrowDown";
        const decrease = isHorizontal ? "ArrowLeft" : "ArrowUp";
        if (![increase, decrease, "Home", "End"].includes(event.key)) return;

        event.preventDefault();
        const size = this.#sizes[index];
        const pairSize = size + this.#sizes[index + 1];
        const step = pairSize * 0.05;
        this.#resize(
            index,
            pairSize,
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? pairSize
                  : size + (event.key === increase ? step : -step)
        );
    }
}

customElements.define("split-panel", SplitPanel);
