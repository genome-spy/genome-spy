/**
 * @param {HTMLElement} container
 */
export function createViewHighlighter(container) {
    /**
     * @param {import("../view/view.js").default | null} view
     */
    return (view) => {
        container.querySelector(".view-highlight")?.remove();
        if (view) {
            if (!view.isConfiguredVisible()) {
                return;
            }
            const coords = view.coords;
            if (coords) {
                const div = document.createElement("div");
                div.className = "view-highlight";
                div.style.position = "absolute";
                div.style.left = coords.x + "px";
                div.style.top = coords.y + "px";
                div.style.width = coords.width + "px";
                div.style.height = coords.height + "px";
                div.style.border = "1px solid green";
                div.style.backgroundColor = "rgba(0, 255, 0, 0.1)";
                div.style.pointerEvents = "none";
                container.appendChild(div);
            }
        }
    };
}
