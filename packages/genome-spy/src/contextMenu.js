import { html, render } from "lit-html";
import { icon } from "@fortawesome/fontawesome-svg-core";

/** @type {HTMLElement} */
let currentlyOpenMenuElement;

/**
 * @typedef {Object} MenuItem
 * @prop {string | import("lit-html").TemplateResult} [label]
 * @prop {function} [callback]
 * @prop {string} [type]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 * @prop {Element} [menuContainer]
 */

/**
 * @param {MenuOptions} options
 * @param {MouseEvent} mouseEvent
 */
export default function contextMenu(options, mouseEvent) {
    // TODO: Suppress tooltips when context menu is open

    if (currentlyOpenMenuElement) {
        currentlyOpenMenuElement.remove();
        currentlyOpenMenuElement = null;
    }

    const menuElement = document.createElement("div");
    menuElement.className = "context-menu";

    const container = options.menuContainer || document.body;

    render(
        options.items.map(item => {
            switch (item.type) {
                case "divider":
                    return html`
                        <div class="context-menu-divider"></div>
                    `;
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
                                        menuElement.remove();
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

    const rect = menuElement.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
        menuElement.style.top =
            window.innerHeight - menuElement.offsetHeight - 10 + "px";
    }
    if (rect.right > window.innerWidth) {
        menuElement.style.left =
            window.innerWidth - menuElement.offsetWidth - 10 + "px";
    }

    container.addEventListener("click", () => menuElement.remove(), {
        once: true
    });

    const openedAt = performance.now();
    container.addEventListener(
        "mouseup",
        () => {
            if (performance.now() - openedAt > 500) {
                menuElement.remove();
            }
        },
        { once: true }
    );

    mouseEvent.preventDefault();
}
