/**
 * Creates a GenomeSpy favicon link that opens the website in a new tab.
 * @returns {import("../controls.js").Control}
 */
export function genomeSpyButton() {
    return {
        mount({ container }) {
            const doc = container.ownerDocument;
            const element = doc.createElement("a");
            element.href = "https://genomespy.app/";
            element.target = "_blank";
            element.rel = "noopener noreferrer";
            element.style.padding = "5px";
            element.title = "About GenomeSpy";
            element.setAttribute("aria-label", element.title);

            const image = doc.createElement("img");
            // Resolve relative to the module for both bundlers and direct imports.
            image.src = new URL(
                "../img/genomespy-favicon.svg",
                import.meta.url
            ).href;
            image.alt = "";
            image.style.width = image.style.height = "20px";
            element.append(image);

            return {
                element,
                dispose() {
                    element.remove();
                },
            };
        },
    };
}
