import { html, nothing, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "@genome-spy/core/utils/ui/tooltip.js";
import { computePosition, flip, offset } from "@floating-ui/dom";
import { debounce } from "@genome-spy/core/utils/debounce.js";
import { faEllipsisV } from "@fortawesome/free-solid-svg-icons";

/**
 * @typedef {Object} MenuItem
 * @prop {import("lit").TemplateResult} [customContent]
 * @prop {string | import("lit").TemplateResult} [label]
 * @prop {function} [callback]
 * @prop {string} [shortcut] Shortcut key. Just for displaying.
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

/** @type {MenuItem} */
export const DIVIDER = {
    type: "divider",
};

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
                class="choice-item"
                @mouseup=${() => {
                    clearMenu();
                    item.callback();
                }}
            >
                <span
                    >${item.icon ? icon(item.icon).node[0] : ""}
                    ${item.label}</span
                >
                ${item.shortcut
                    ? html`<span class="kbd-shortcut">${item.shortcut}</span>`
                    : nothing}
            </a>

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
            if (item.customContent) {
                return item.customContent;
            } else if (item.submenu) {
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
    menuElement.addEventListener("mouseup", (event) => event.stopPropagation());
    menuElement.addEventListener("click", (event) => event.stopPropagation());

    // TODO: Keyboard navigation: https://web.dev/building-a-split-button-component/

    render(
        items.map((item) => menuItemToTemplate(item, level)),
        menuElement
    );

    backdropElement.appendChild(menuElement);
    clearSubmenus(level);
    openLevels[level] = menuElement;

    placement ??= "right-start";
    const adjust = !/^(top|bottom)/.test(placement);

    computePosition(openerElement, menuElement, {
        placement,
        middleware: level < 1 && adjust ? [offset(2), flip()] : [flip()],
    }).then(({ x, y }) => {
        const first = /** @type {HTMLElement} */ (
            menuElement.querySelector(":scope > li")
        );
        if (first && adjust) {
            // Align items nicely
            y -= first.getBoundingClientRect().top;
        }
        menuElement.style.left = `${x}px`;
        menuElement.style.top = `${y}px`;
    });
}

/** @type {any} */
let lastOpener;

function prepareBackdrop() {
    const container = document.body;
    const openedAt = performance.now();

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
}
/**
 *
 * @param {MenuOptions} options
 * @param {HTMLElement | VirtualElement} openerElement
 * @param {import("@floating-ui/core").Placement} [placement]
 */
export function dropdownMenu(options, openerElement, placement) {
    placement ??= "bottom-start";

    // Create new or just update?
    if (backdropElement && lastOpener !== openerElement) {
        clearMenu();
    }
    lastOpener = openerElement;

    if (!backdropElement) {
        prepareBackdrop();
        renderAndPositionMenu(options.items, openerElement, 0, placement);
    } else {
        // Update existing menu
        const level = 0;
        render(
            options.items.map((item) => menuItemToTemplate(item, level)),
            openLevels[0]
        );
    }
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
