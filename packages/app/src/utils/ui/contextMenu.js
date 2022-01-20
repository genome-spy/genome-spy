import { html, nothing, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "@genome-spy/core/utils/ui/tooltip";
import { computePosition, flip } from "@floating-ui/dom";
import { debounce } from "@genome-spy/core/utils/debounce";
import { faEllipsisV } from "@fortawesome/free-solid-svg-icons";

/**
 * @typedef {Object} MenuItem
 * @prop {string | import("lit").TemplateResult} [label]
 * @prop {function} [callback]
 * @prop {function} [ellipsisCallback]
 * @prop {"divider" | "header" | undefined} [type]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 * @prop {MenuItem[]} [submenu]
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 *
 * @typedef {Object} VirtualElement
 * @prop {() => DOMRect} getBoundingClientRect
 */

/** @type {HTMLElement} */
let backdropElement;

/** @type {HTMLElement[]} */
const openLevels = [];

const debouncer = debounce((/** @type {() => void}*/ fun) => fun(), 150, false);

/**
 * Returns true if a menu is visible
 */
export function isContextMenuOpen() {
    return !!backdropElement;
}

/**
 * @param {UIEvent} [uiEvent]
 */
function clearMenu(uiEvent) {
    if (uiEvent?.type == "contextmenu") {
        uiEvent.preventDefault();
        return;
    }

    if (backdropElement) {
        backdropElement.remove();
        backdropElement = undefined;

        // Hide tooltip
        document.body.classList.remove(SUPPRESS_TOOLTIP_CLASS_NAME);
    }
}

/**
 * @param {number} fromLevel
 */
function clearSubmenus(fromLevel) {
    if (fromLevel < 1) {
        return;
    }

    for (let i = fromLevel; i < openLevels.length; i++) {
        openLevels[i]?.remove();
        openLevels[i] = undefined;
    }
    for (const li of openLevels[fromLevel - 1].querySelectorAll("li.active")) {
        li.classList.remove("active");
    }
}

const createDivider = () => html`<li class="menu-divider"></li>`;

const createHeader = (/** @type {MenuItem} */ item) =>
    html` <li class="menu-header">${item.label || "-"}</li> `;

/**
 * @param {MenuItem} item
 * @param {number} level
 */
const createSubmenu = (item, level) =>
    html`
        <li>
            <a
                class="submenu-item"
                @click=${(/** @type {MouseEvent} */ event) =>
                    event.stopPropagation()}
                @mouseup=${(/** @type {MouseEvent} */ event) =>
                    event.stopPropagation()}
                @mouseenter=${(/** @type {MouseEvent} */ event) =>
                    debouncer(() => {
                        const li = /** @type {HTMLElement} */ (
                            event.target
                        ).closest("li");
                        renderAndPositionSubmenu(item.submenu, li, level + 1);
                        event.stopPropagation();
                    })}
                @mouseleave=${() => debouncer(() => clearSubmenus(level + 1))}
                ><span>${item.label}</span></a
            >
        </li>
    `;

const createChoice = (/** @type {MenuItem} */ item) =>
    html`
        <li>
            <a
                @mouseup=${() => {
                    clearMenu();
                    item.callback();
                }}
            >
                ${item.icon ? icon(item.icon).node[0] : ""} ${item.label}</a
            >

            ${item.ellipsisCallback
                ? html` <a
                      class="menu-ellipsis"
                      @click=${item.ellipsisCallback}
                  >
                      ${icon(faEllipsisV).node[0]}
                  </a>`
                : nothing}
        </li>
    `;

const createDisabledItem = (/** @type {MenuItem} */ item) =>
    html`
        <li>
            <span class="disabled-item">
                ${item.icon ? icon(item.icon).node[0] : ""}
                ${item.label || "-"}</span
            >
        </li>
    `;

/**
 * @param {MenuItem} item
 * @param {number} level TODO: refactor this away
 */
export function menuItemToTemplate(item, level = 1) {
    switch (item.type) {
        case "divider":
            return createDivider();
        case "header":
            return createHeader(item);
        default:
            if (item.submenu) {
                return createSubmenu(item, level);
            } else if (item.callback) {
                return createChoice(item);
            } else {
                return createDisabledItem(item);
            }
    }
}

/**
 * @param {MenuItem[]} items
 * @param {HTMLElement} openerElement
 * @param {number} level
 */
function renderAndPositionSubmenu(items, openerElement, level) {
    renderAndPositionMenu(items, openerElement, level, "right-start");
    openerElement.classList.add("active");
}

/**
 *
 * @param {MenuItem[]} items
 * @param {VirtualElement} openerElement
 * @param {number} level
 * @param {import("@floating-ui/core").Placement} [placement]
 */
function renderAndPositionMenu(items, openerElement, level, placement) {
    const menuElement = document.createElement("ul");
    menuElement.classList.add("gs-context-menu");
    menuElement.addEventListener("mouseenter", () => {
        debouncer(() => {
            // nop. clear the debouncer.
        });
    });

    // TODO: Keyboard navigation: https://web.dev/building-a-split-button-component/

    render(
        items.map((item) => menuItemToTemplate(item, level)),
        menuElement
    );

    backdropElement.appendChild(menuElement);
    clearSubmenus(level);
    openLevels[level] = menuElement;

    computePosition(openerElement, menuElement, {
        placement: placement ?? "right-start",
        middleware: [flip()],
    }).then(({ x, y }) => {
        const first = /** @type {HTMLElement} */ (
            menuElement.querySelector(":scope > li")
        );
        if (first) {
            // Align items nicely
            y -= first.getBoundingClientRect().top;
        }
        menuElement.style.left = `${x}px`;
        menuElement.style.top = `${y}px`;
    });
}

/**
 *
 * @param {MenuOptions} options
 * @param {HTMLElement | VirtualElement} openerElement
 * @param {import("@floating-ui/core").Placement} [placement]
 */
export function dropdownMenu(options, openerElement, placement) {
    placement ??= "bottom-start";

    clearMenu();

    const openedAt = performance.now();

    const container = document.body;
    backdropElement = document.createElement("div");
    backdropElement.classList.add("gs-context-menu-backdrop");

    backdropElement.addEventListener("click", clearMenu);
    backdropElement.addEventListener("contextmenu", clearMenu);

    backdropElement.addEventListener(
        "mouseup",
        () => {
            if (performance.now() - openedAt > 500) {
                clearMenu();
            }
        },
        { once: true }
    );

    container.appendChild(backdropElement);

    document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);

    renderAndPositionMenu(options.items, openerElement, 0, placement);
}

/**
 * @param {MenuOptions} options
 * @param {MouseEvent} mouseEvent
 */
export function contextMenu(options, mouseEvent) {
    dropdownMenu(options, getVirtualElement(mouseEvent), "right-start");
    mouseEvent.preventDefault();
}

/**
 * @param {{ clientX: number, clientY: number}} event
 * @returns {VirtualElement}
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
                toJSON: undefined,
            };
        },
    };
}
