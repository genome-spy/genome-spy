import { html, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "@genome-spy/core/utils/ui/tooltip";
import { computePosition, flip } from "@floating-ui/dom";

/** @type {HTMLElement} */
let backdropElement;

/**
 * @typedef {Object} MenuItem
 * @prop {string | import("lit").TemplateResult} [label]
 * @prop {function} [callback]
 * @prop {string} [type]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 */

/**
 * Returns true if a menu is visible
 */
export function isContextMenuOpen() {
    return !!backdropElement;
}

function clearMenu() {
    if (backdropElement) {
        backdropElement.remove();
        backdropElement = undefined;

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

    backdropElement = document.createElement("div");
    backdropElement.classList.add("gs-context-menu-backdrop");

    const menuElement = document.createElement("ul");
    menuElement.classList.add("gs-context-menu");

    const container = document.body;

    // TODO: Keyboard navigation: https://web.dev/building-a-split-button-component/

    render(
        options.items.map((item) => {
            switch (item.type) {
                case "divider":
                    return html` <li class="menu-divider"></li> `;
                case "header":
                    return html`
                        <li class="menu-header">${item.label || "-"}</li>
                    `;
                default:
                    if (item.callback) {
                        return html`
                            <li>
                                <a
                                    @mouseup=${() => {
                                        // Prevent accidental selection when the position of an overflowing menu has been adjusted
                                        if (
                                            performance.now() - openedAt >
                                            200
                                        ) {
                                            clearMenu();
                                            item.callback();
                                        }
                                    }}
                                >
                                    ${item.icon ? icon(item.icon).node[0] : ""}
                                    ${item.label}</a
                                >
                            </li>
                        `;
                    } else {
                        return html`
                            <li>
                                <span class="disabled-item">
                                    ${item.icon ? icon(item.icon).node[0] : ""}
                                    ${item.label || "-"}</span
                                >
                            </li>
                        `;
                    }
            }
        }),
        menuElement
    );

    container.appendChild(backdropElement);
    backdropElement.appendChild(menuElement);

    computePosition(getVirtualElement(mouseEvent), menuElement, {
        placement: "bottom-start",
        middleware: [flip()],
    }).then(({ x, y }) => {
        menuElement.style.left = `${x}px`;
        menuElement.style.top = `${y}px`;
    });

    backdropElement.addEventListener("click", () => clearMenu(), {
        once: true,
    });

    document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);

    const openedAt = performance.now();
    backdropElement.addEventListener(
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

/**
 * @param {{ clientX: number, clientY: number}} event
 */
function getVirtualElement(event) {
    return {
        getBoundingClientRect() {
            return {
                width: 0,
                height: 0,
                x: event.clientX,
                y: event.clientY,
                top: event.clientY,
                left: event.clientX,
                right: event.clientX,
                bottom: event.clientY,
            };
        },
    };
}
