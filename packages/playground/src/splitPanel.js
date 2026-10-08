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

    constructor() {
        super();
        this.orientation = "horizontal";
        this.reverse = false;
    }

    connectedCallback() {
        super.connectedCallback();

        this.#childrenObserver = new MutationObserver(() =>
            this.requestUpdate()
        );
        this.#childrenObserver.observe(this, { childList: true });
    }

    disconnectedCallback() {
        this.#childrenObserver?.disconnect();
        this.#childrenObserver = undefined;
        super.disconnectedCallback();
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
        }

        .resizable-handle:hover {
            background-color: var(--handle-hover-color);
        }

        :host([orientation="horizontal"]) .resizable-handle {
            right: -3px;
            top: 0;
            width: 5px;
            height: 100%;
            cursor: ew-resize;
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
    `;

    render() {
        return html`<div class="container">${this.#renderChildren()}</div>`;
    }

    #renderChildren() {
        const children = Array.from(this.children);
        const orderedChildren = this.reverse ? children.reverse() : children;
        return orderedChildren.map((child, index) => {
            const style = `flex-basis: ${100 / children.length}%`;

            return html`
                <div class="resizable" style=${style}>
                    <slot
                        class="resizable-slot"
                        name=${child.getAttribute("slot")}
                    ></slot>
                    ${
                        index < children.length - 1
                            ? html`<div
                                  class="resizable-handle"
                                  @mousedown=${(/** @type {MouseEvent} */ e) =>
                                      this.#startResize(e, index)}
                              ></div>`
                            : ""
                    }
                </div>
            `;
        });
    }

    /**
     * @param {MouseEvent} event
     * @param {number} index
     */
    #startResize(event, index) {
        event.preventDefault();
        event.stopPropagation();

        const resizables = this.shadowRoot.querySelectorAll(".resizable");
        const current = /** @type {HTMLElement} */ (resizables[index]);
        const next = /** @type {HTMLElement} */ (resizables[index + 1]);

        const isHorizontal = this.orientation === "horizontal";
        const startPosition = isHorizontal ? event.clientX : event.clientY;
        const currentStartSize = isHorizontal
            ? current.getBoundingClientRect().width
            : current.getBoundingClientRect().height;
        const nextStartSize = isHorizontal
            ? next.getBoundingClientRect().width
            : next.getBoundingClientRect().height;

        this.classList.add("resizing");

        const onMouseMove = (/** @type {MouseEvent} */ event) => {
            const position = isHorizontal ? event.clientX : event.clientY;
            const delta = position - startPosition;
            const pairSize = currentStartSize + nextStartSize;
            // Pixel flex sizes avoid border rounding and flex-grow redistribution offsets.
            const currentSize = Math.max(
                0,
                Math.min(currentStartSize + delta, pairSize)
            );
            const nextSize = pairSize - currentSize;

            current.style.flex = `0 0 ${currentSize}px`;
            next.style.flex = `0 0 ${nextSize}px`;
            event.stopPropagation();
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            this.classList.remove("resizing");
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }
}

customElements.define("split-panel", SplitPanel);
