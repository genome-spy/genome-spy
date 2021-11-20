import { html, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "../../../utils/ui/tooltip";

/** @type {HTMLElement} */
let currentlyOpenMenuElement;

/**
 * @typedef {Object} MenuItem
 * @prop {string | import("lit").TemplateResult} [label]
 * @prop {function} [callback]
 * @prop {string} [type]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 * @prop {Element} [menuContainer]
 */

/**
 * Returns true if a menu is visible
 */
export function isContextMenuOpen() {
    return !!currentlyOpenMenuElement;
}

function clearMenu() {
    if (currentlyOpenMenuElement) {
        currentlyOpenMenuElement.remove();
        currentlyOpenMenuElement = undefined;

        // Hide tooltip
        document.body.classList.remove(SUPPRESS_TOOLTIP_CLASS_NAME);
    }
}

/**
 * @param {MenuOptions} options
 * @param {MouseEvent} mouseEvent
 */
export default function contextMenu(options, mouseEvent) {
    clearMenu();

    const menuElement = document.createElement("div");
    menuElement.className = "gs-context-menu";

    const container = options.menuContainer || document.body;

    // TODO: Keyboard navigation: https://web.dev/building-a-split-button-component/

    render(
        options.items.map((item) => {
            switch (item.type) {
                case "divider":
                    return html` <div class="context-menu-divider"></div> `;
                case "header":
                    return html`
                        <div class="context-menu-header">
                            ${item.label || "-"}
                        </div>
                    `;
                default:
                    if (item.callback) {
                        return html`
                            <a
                                class="context-menu-item"
                                @mouseup=${() => {
                                    // Prevent accidental selection when the position of an overflowing menu has been adjusted
                                    if (performance.now() - openedAt > 200) {
                                        clearMenu();
                                        item.callback();
                                    }
                                }}
                            >
                                ${item.icon ? icon(item.icon).node[0] : ""}
                                ${item.label}</a
                            >
                        `;
                    } else {
                        return html`
                            <div class="context-menu-item">
                                ${item.label || "-"}
                            </div>
                        `;
                    }
            }
        }),
        menuElement
    );

    menuElement.style.left = mouseEvent.clientX + "px";
    menuElement.style.top = mouseEvent.clientY + "px";
    currentlyOpenMenuElement = menuElement;

    container.appendChild(menuElement);
    document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);

    const rect = menuElement.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
        menuElement.style.top =
            window.innerHeight - menuElement.offsetHeight - 10 + "px";
    }
    if (rect.right > window.innerWidth) {
        menuElement.style.left =
            window.innerWidth - menuElement.offsetWidth - 10 + "px";
    }

    container.addEventListener("click", () => clearMenu(), {
        once: true,
    });

    const openedAt = performance.now();
    container.addEventListener(
        "mouseup",
        () => {
            if (performance.now() - openedAt > 500) {
                clearMenu();
            }
        },
        { once: true }
    );

    mouseEvent.preventDefault();
}
