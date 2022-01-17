import { html, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { SUPPRESS_TOOLTIP_CLASS_NAME } from "@genome-spy/core/utils/ui/tooltip";
import { computePosition, flip } from "@floating-ui/dom";
import { debounce } from "@genome-spy/core/utils/debounce";

/**
 * @typedef {Object} MenuItem
 * @prop {string | import("lit").TemplateResult} [label]
 * @prop {function} [callback]
 * @prop {"divider" | "header" | undefined} [type]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 * @prop {MenuItem[]} [submenu]
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
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

function clearMenu() {
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
 * @param {MenuItem[]} items
 * @param {HTMLElement} openerElement
 * @param {number} level
 */
function renderAndPositionSubmenu(items, openerElement, level) {
    renderAndPositionMenu(items, openerElement, level);
    openerElement.classList.add("active");
}

/**
 *
 * @param {MenuItem[]} items
 * @param {{ getBoundingClientRect: () => DOMRect}} openerElement
 * @param {number} level
 */
function renderAndPositionMenu(items, openerElement, level) {
    const menuElement = document.createElement("ul");
    menuElement.classList.add("gs-context-menu");
    menuElement.addEventListener("mouseenter", () => {
        debouncer(() => {
            // nop. clear the debouncer.
        });
    });

    // TODO: Keyboard navigation: https://web.dev/building-a-split-button-component/

    render(
        items.map((item) => {
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
        }),
        menuElement
    );

    backdropElement.appendChild(menuElement);
    clearSubmenus(level);
    openLevels[level] = menuElement;

    computePosition(openerElement, menuElement, {
        placement: "right-start",
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
 * @param {MenuOptions} options
 * @param {MouseEvent} mouseEvent
 */
export default function contextMenu(options, mouseEvent) {
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

    renderAndPositionMenu(options.items, getVirtualElement(mouseEvent), 0);

    mouseEvent.preventDefault();
}

/**
 * @param {{ clientX: number, clientY: number}} event
 */
function getVirtualElement(event) {
    return {
        /**
         * @returns {DOMRect}
         */
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
