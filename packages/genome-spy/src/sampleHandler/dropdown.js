/** @type {Set<HTMLElement>} */
const visibleDropdowns = new Set();

/**
 * @param {UIEvent} event
 */
export function toggleDropdown(event) {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    const dropdown = /** @type {HTMLElement} */ (target.parentNode);
    const show = !dropdown.classList.contains("show");

    for (const dropdown of visibleDropdowns) {
        dropdown.classList.remove("show");
    }
    visibleDropdowns.clear();

    event.stopPropagation();

    if (show) {
        visibleDropdowns.add(dropdown);

        dropdown.classList.add("show");
        window.addEventListener(
            "click",
            e => {
                if (dropdown.classList.contains("show")) {
                    dropdown.classList.remove("show");
                    e.preventDefault();
                }
            },
            { once: true }
        );
    } else {
        window.dispatchEvent(new MouseEvent("click"));
    }
}
