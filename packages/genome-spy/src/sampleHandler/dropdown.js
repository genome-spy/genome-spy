/**
 *
 * @param {UIEvent} event
 */
export function toggleDropdown(event) {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    const dropdown = /** @type {HTMLElement} */ (target.parentNode);

    if (!dropdown.classList.contains("show")) {
        event.stopPropagation();
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
