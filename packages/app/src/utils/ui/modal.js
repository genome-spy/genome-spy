import { html, nothing, render } from "lit";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "@genome-spy/core/utils/ui/tooltip";

const CLOSE_EVENT_TYPE = "close-dialog";

export function createCloseEvent() {
    return new CustomEvent(CLOSE_EVENT_TYPE, { bubbles: true });
}

/**
 * @param {"default" | "tour"} type
 */
export function createModal(type = "default") {
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
                button.click();
                event.stopPropagation();
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

    document.body.appendChild(root);

    // Trigger animation
    window.requestAnimationFrame(() => root.classList.add("visible"));
    document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);

    return {
        content: /** @type {HTMLDivElement} */ (root.querySelector(".content")),
        close,
    };
}

/**
 * @param {string | import("lit").TemplateResult | HTMLElement} content
 * @param {string} title
 * @param {boolean} [cancelButton] show cancelbutton
 * @returns {Promise<boolean>}
 */
export function messageBox(content, title = undefined, cancelButton = false) {
    const modal = createModal();

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
                        cancelButton
                            ? html`
                                  <button
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
                    <button @click=${close}>OK</button>
                </div>
            </div>`;
        render(template, modal.content);
    });
}
