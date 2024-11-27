import { LitElement, html, css } from "lit";

/**
 * A resizable split panel component.
 */
class SplitPanel extends LitElement {
    static properties = {
        orientation: { type: String, reflect: true },
        inverse: { type: Boolean, reflect: true },
    };

    constructor() {
        super();
        this.orientation = "horizontal";
        this.reverse = false;
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
        return Array.from(this.reverse ? children.reverse() : children).map(
            (child, index) => {
                return html`
                    <div
                        class="resizable"
                        style="flex-basis: ${100 / children.length}%"
                    >
                        <slot
                            class="resizable-slot"
                            name=${child.getAttribute("slot")}
                        ></slot>
                        ${index < children.length - 1
                            ? html`<div
                                  class="resizable-handle"
                                  @mousedown=${(/** @type {MouseEvent} */ e) =>
                                      this.#startResize(e, index)}
                              ></div>`
                            : ""}
                    </div>
                `;
            }
        );
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

        const startX = event.clientX;
        const startY = event.clientY;
        const currentStartWidth = current.getBoundingClientRect().width;
        const currentStartHeight = current.getBoundingClientRect().height;
        const nextStartWidth = next.getBoundingClientRect().width;
        const nextStartHeight = next.getBoundingClientRect().height;

        this.classList.add("resizing");

        const onMouseMove = (/** @type {MouseEvent} */ event) => {
            if (this.orientation === "horizontal") {
                const dx = event.clientX - startX;
                current.style.flexBasis = `${((currentStartWidth + dx) / this.clientWidth) * 100}%`;
                next.style.flexBasis = `${((nextStartWidth - dx) / this.clientWidth) * 100}%`;
            } else {
                const dy = event.clientY - startY;
                current.style.flexBasis = `${((currentStartHeight + dy) / this.clientHeight) * 100}%`;
                next.style.flexBasis = `${((nextStartHeight - dy) / this.clientHeight) * 100}%`;
            }
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
