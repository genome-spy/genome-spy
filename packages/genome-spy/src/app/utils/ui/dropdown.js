import { SUPPRESS_TOOLTIP_CLASS_NAME } from "../../../utils/ui/tooltip";

/** @type {Set<HTMLElement>} */
const visibleDropdowns = new Set();

/**
 * @param {UIEvent} event
 * @return `true` if the dropdown was made visible
 */
export function toggleDropdown(event) {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    const dropdown = /** @type {HTMLElement} */ (target.parentNode);
    const show = !dropdown.classList.contains("show");

    for (const dropdown of visibleDropdowns) {
        dropdown.classList.remove("show");
        document.body.classList.remove(SUPPRESS_TOOLTIP_CLASS_NAME);
    }
    visibleDropdowns.clear();

    event.stopPropagation();

    if (show) {
        visibleDropdowns.add(dropdown);
        dropdown.classList.add("show");
        document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);
        window.addEventListener(
            "click",
            (e) => {
                if (dropdown.classList.contains("show")) {
                    dropdown.classList.remove("show");
                    document.body.classList.remove(SUPPRESS_TOOLTIP_CLASS_NAME);
                    e.preventDefault();
                }
            },
            { once: true }
        );
    } else {
        window.dispatchEvent(new MouseEvent("click"));
    }

    return show;
}
