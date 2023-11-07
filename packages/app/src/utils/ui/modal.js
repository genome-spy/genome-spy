import { html, nothing, render } from "lit";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "@genome-spy/core/utils/ui/tooltip.js";

const CLOSE_EVENT_TYPE = "close-dialog";

export function createCloseEvent() {
    return new CustomEvent(CLOSE_EVENT_TYPE, { bubbles: true });
}

/**
 * @typedef {object} Modal
 * @prop {HTMLDivElement} content
 * @prop {() => void} close
 */

/**
 * @param {"default" | "tour"} type
 * @param {HTMLElement} [container]
 * @returns {Modal}
 */
export function createModal(type = "default", container = document.body) {
    const root = document.createElement("div");
    root.classList.add("gs-modal");

    if (type != "default") {
        root.classList.add(type);
    }

    const onKeyDown = (/** @type {KeyboardEvent} */ event) => {
        switch (event.key) {
            case "Escape": {
                const button = /** @type {HTMLButtonElement} */ (
                    root.querySelector(".btn-cancel")
                );
                if (button) {
                    button.click();
                    event.stopPropagation();
                }
                break;
            }
            case "Enter": {
                if (
                    /** @type {HTMLElement} */ (event.target)?.tagName ==
                    "TEXTAREA"
                ) {
                    return;
                }

                const button = /** @type {HTMLButtonElement} */ (
                    root.querySelector(".btn-primary")
                );
                button.click();
                event.stopPropagation();
                break;
            }
            default:
        }
    };

    root.addEventListener("keydown", onKeyDown);

    render(
        html`<div class="backdrop"></div>
            <div class="content"></div>`,
        root
    );

    const close = () => {
        root.querySelector(".backdrop").addEventListener("transitionend", () =>
            root.remove()
        );
        root.classList.remove("visible");
        document.body.classList.remove(SUPPRESS_TOOLTIP_CLASS_NAME);
    };

    // Disable GenomeSpy's keyboard shortcuts while a modal is open
    root.addEventListener("keydown", (event) => {
        event.stopPropagation();
    });

    root.addEventListener(CLOSE_EVENT_TYPE, close);

    container.appendChild(root);

    // Trigger animation
    window.requestAnimationFrame(() => root.classList.add("visible"));
    if (type != "tour") {
        document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);
    }

    return {
        content: /** @type {HTMLDivElement} */ (root.querySelector(".content")),
        close,
    };
}

/**
 * @typedef {object} MessageBoxOptions
 * @prop {string} [title]
 * @prop {string} [okLabel]
 * @prop {boolean} [cancelButton]
 */

/**
 * @param {string | import("lit").TemplateResult | HTMLElement} content
 * @param {MessageBoxOptions} [options]
 * @returns {Promise<boolean>}
 */
export function messageBox(content, options = {}) {
    const modal = createModal();

    const title = options.title;
    options.okLabel ??= "OK";

    return new Promise((resolve, reject) => {
        const close = () => {
            modal.close();
            resolve(true);
        };

        const template = html`
            ${title ? html`<div class="modal-title">${title}</div>` : nothing}
                <div class="modal-body" style="max-width: 700px">
                    ${content}
                </div>
                <div class="modal-buttons">
                    ${
                        options.cancelButton
                            ? html`
                                  <button
                                      class="btn"
                                      @click=${() => {
                                          modal.close();
                                          resolve(false);
                                      }}
                                  >
                                      Cancel
                                  </button>
                              `
                            : nothing
                    }
                    <button class="btn" @click=${close}>${
            options.okLabel
        }</button>
                </div>
            </div>`;
        render(template, modal.content);
    });
}
