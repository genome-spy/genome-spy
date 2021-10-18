import { html, nothing, render } from "lit";

export function createModal() {
    const root = document.createElement("div");
    root.className = "genome-spy-modal";

    render(
        html`<div class="backdrop"></div>
            <div class="content"></div>`,
        root
    );

    // Disable GenomeSpy's keyboard shortcuts while a modal is open
    root.addEventListener("keydown", (event) => {
        event.stopPropagation();
    });

    document.body.appendChild(root);

    // Trigger animation
    window.requestAnimationFrame(() => root.classList.add("visible"));

    return {
        content: /** @type {HTMLDivElement} */ (root.querySelector(".content")),
        close: () => {
            root.querySelector(".backdrop").addEventListener(
                "transitionend",
                () => root.remove()
            );
            root.classList.remove("visible");
        },
    };
}

/**
 * @param {string | import("lit").TemplateResult | HTMLElement} content
 * @param {string} title
 */
export function messageBox(content, title = undefined) {
    const modal = createModal();

    return new Promise((resolve, reject) => {
        const template = html`
            ${title ? html`<div class="modal-title">${title}</div>` : nothing}
                <div class="modal-body" style="max-width: 700px">
                    ${content}
                </div>
                <div class="modal-buttons">
                    <button @click=${() => {
                        modal.close();
                        resolve();
                    }}>Close</button>
                </div>
            </div>`;
        render(template, modal.content);
    });
}
