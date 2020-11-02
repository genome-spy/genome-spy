/** @type {HTMLElement} */
var currentlyOpenMenuElement;

/**
 * @typedef {Object} MenuItem
 * @prop {string} [label]
 * @prop {function} [callback]
 * @prop {string} [type]
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

    for (let item of options.items) {
        let itemElement;

        if (item.type == "divider") {
            itemElement = document.createElement("div");
            itemElement.classList.add("context-menu-divider");
        } else if (item.type == "header") {
            itemElement = document.createElement("div");
            itemElement.classList.add("context-menu-header");
            itemElement.innerText = item.label || "-";
        } else {
            itemElement = document.createElement(item.callback ? "a" : "div");
            itemElement.classList.add("context-menu-item");
            itemElement.innerText = item.label || "-";

            if (item.callback) {
                itemElement.addEventListener("mouseup", () => {
                    // Prevent accidental selection when the position of an overflowing menu has been adjusted
                    if (performance.now() - openedAt > 200) {
                        menuElement.remove();
                        item.callback();
                    }
                });
            }
        }

        menuElement.appendChild(itemElement);
    }

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
