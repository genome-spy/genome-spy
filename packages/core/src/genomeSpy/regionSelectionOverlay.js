/** Transient lasso path in canvas CSS coordinates, outside the point render loop.
 * @param {HTMLElement} container */
export function createRegionSelectionOverlay(container) {
    // A DOM path keeps drawing responsive without repainting millions of point marks.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.assign(svg.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
    });
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#ea580c");
    path.setAttribute("stroke-width", "1.5");
    svg.append(path);
    container.append(svg);
    return {
        /** @param {ReadonlyArray<readonly [number,number]>} points */
        update(points) {
            path.setAttribute(
                "d",
                points.length
                    ? points
                          .map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`)
                          .join(" ") + " Z"
                    : ""
            );
        },
        dispose() {
            svg.remove();
        },
    };
}
