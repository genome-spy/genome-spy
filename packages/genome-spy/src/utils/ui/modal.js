import { html, render } from "lit";

export default function createModal() {
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
