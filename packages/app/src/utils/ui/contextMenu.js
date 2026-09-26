import { html, nothing, render } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    FREEZE_INTERACTION_CLASS_NAME,
    SUPPRESS_TOOLTIP_CLASS_NAME,
} from "@genome-spy/core/utils/ui/tooltip.js";
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
 * @prop {MenuItem[] | (() => MenuItem[] | Promise<MenuItem[]>)} [submenu]
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 * @prop {"command" | "controls"} [mode]
 * @prop {string} [label]
 *
 * @typedef {Object} VirtualElement
 * @prop {() => DOMRect} getBoundingClientRect
 */

/** @type {HTMLElement} */
let backdropElement;

/** @type {HTMLElement[]} */
const openLevels = [];

/** @type {HTMLElement[]} */
const commandLevels = [];

/** @type {HTMLElement[]} */
const commandTriggers = [];

/** @type {WeakMap<HTMLElement, symbol>} */
const submenuRequests = new WeakMap();

/** @type {HTMLElement | null} */
let returnFocus = null;

/** @type {HTMLElement | null} */
let rootTrigger = null;

/** @type {"command" | "controls" | undefined} */
let currentMode;

let nextMenuId = 0;

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
function clearMenu(uiEvent, restoreFocus = false) {
    if (uiEvent?.type == "contextmenu") {
        uiEvent.preventDefault();
        return;
    }

    if (backdropElement) {
        debouncer(() => {});
        closeCommandSubmenus(1);
        commandLevels.length = 0;
        rootTrigger?.setAttribute("aria-expanded", "false");
        rootTrigger?.removeAttribute("aria-controls");
        rootTrigger = null;
        backdropElement.remove();
        backdropElement = undefined;
        openLevels.length = 0;
        lastOpener = undefined;
        currentMode = undefined;

        // Hide tooltip
        document.body.classList.remove(SUPPRESS_TOOLTIP_CLASS_NAME);
        document.body.classList.remove(FREEZE_INTERACTION_CLASS_NAME);

        if (restoreFocus && returnFocus?.isConnected) {
            returnFocus.focus();
        }
        returnFocus = null;
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

const createHeader = (/** @type {MenuItem} */ item) => html`
    <li class="menu-header">${item.label || "-"}</li>
`;

/**
 * @param {MenuItem} item
 * @param {number} level
 */
const createSubmenu = (item, level) => html`
    <li>
        <div
            class="submenu-item"
            @mouseenter=${(/** @type {MouseEvent} */ event) =>
                debouncer(() => {
                    const li = /** @type {HTMLElement} */ (
                        event.target
                    ).closest("li");
                    void openSubmenu(item, li, level + 1);
                    event.stopPropagation();
                })}
            @mouseleave=${() => debouncer(() => clearSubmenus(level + 1))}
        >
            ${
                item.customContent
                    ? item.customContent
                    : html`<span
                          >${item.icon ? icon(item.icon).node[0] : nothing}
                          ${item.label}</span
                      >`
            }
        </div>
    </li>
`;

/**
 * @param {MenuItem} item
 * @param {HTMLElement} li
 * @param {number} level
 */
async function openSubmenu(item, li, level) {
    try {
        const submenuSource =
            typeof item.submenu == "function" ? item.submenu() : item.submenu;

        if (submenuSource instanceof Promise) {
            renderAndPositionSubmenu([{ label: "Loading..." }], li, level);
            const submenu = await submenuSource;
            if (!li.isConnected || !li.classList.contains("active")) {
                return;
            }
            renderAndPositionSubmenu(submenu, li, level);
        } else {
            renderAndPositionSubmenu(submenuSource, li, level);
        }
    } catch {
        if (!li.isConnected) {
            return;
        }
        renderAndPositionSubmenu(
            [{ label: "Could not open submenu." }],
            li,
            level
        );
    }
}

const createChoice = (/** @type {MenuItem} */ item) => html`
    <li>
        <a
            class="choice-item"
            @mouseup=${() => {
                clearMenu();
                item.callback();
            }}
        >
            <span
                >${item.icon ? icon(item.icon).node[0] : ""} ${item.label}</span
            >
            ${
                item.shortcut
                    ? html`<span class="kbd-shortcut">${item.shortcut}</span>`
                    : nothing
            }
        </a>

        ${
            item.ellipsisCallback
                ? html` <a
                      class="menu-ellipsis"
                      @click=${item.ellipsisCallback}
                  >
                      ${icon(faEllipsisV).node[0]}
                  </a>`
                : nothing
        }
    </li>
`;

const createDisabledItem = (/** @type {MenuItem} */ item) => html`
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
            } else if (item.customContent) {
                return item.customContent;
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
    // A fixed menu appended to a long document would otherwise initially have
    // a static position below its content. The alignment adjustment below must
    // measure it from the viewport instead.
    menuElement.style.top = "0";
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
        strategy: "fixed",
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
    document.body.classList.add(FREEZE_INTERACTION_CLASS_NAME);
}

/**
 * @param {number} fromLevel
 */
function closeCommandSubmenus(fromLevel) {
    for (let level = fromLevel; level < commandLevels.length; level++) {
        commandLevels[level]?.remove();
        const trigger = commandTriggers[level];
        if (trigger) {
            submenuRequests.delete(trigger);
            trigger.setAttribute("aria-expanded", "false");
            trigger.removeAttribute("aria-controls");
            trigger.closest("li")?.classList.remove("active");
        }
    }
    commandLevels.length = fromLevel;
    commandTriggers.length = fromLevel;
}

/**
 * @param {HTMLElement} menu
 * @param {"first" | "last"} [end]
 */
function focusCommandItem(menu, end = "first") {
    const items = Array.from(
        menu.querySelectorAll(":scope > li > [role='menuitem']")
    );
    const item = end === "first" ? items[0] : items.at(-1);
    if (item instanceof HTMLElement) {
        item.focus();
    } else {
        menu.focus();
    }
}

/**
 * @param {MenuItem} item
 * @param {number} level
 */
function commandItemToTemplate(item, level) {
    if (item.type === "divider") {
        return html`<li role="separator" class="menu-divider"></li>`;
    }
    if (item.type === "header") {
        return html`<li
            role="presentation"
            class="menu-header"
            aria-hidden="true"
        >
            ${item.label || "-"}
        </li>`;
    }

    const label = item.label || "-";
    const submenu = Boolean(item.submenu);
    const disabled = !submenu && !item.callback;
    return html`
        <li role="none">
            <button
                type="button"
                role="menuitem"
                class=${
                    submenu
                        ? "submenu-item"
                        : disabled
                          ? "disabled-item"
                          : "choice-item"
                }
                tabindex="-1"
                aria-haspopup=${submenu ? "menu" : nothing}
                aria-expanded=${submenu ? "false" : nothing}
                aria-disabled=${disabled ? "true" : nothing}
                @mouseenter=${
                    submenu
                        ? (/** @type {MouseEvent} */ event) => {
                              const trigger = /** @type {HTMLElement} */ (
                                  event.currentTarget
                              );
                              debouncer(() => {
                                  if (trigger.isConnected) {
                                      void openCommandSubmenu(
                                          item,
                                          trigger,
                                          level + 1,
                                          false
                                      );
                                  }
                              });
                          }
                        : nothing
                }
                @mouseleave=${
                    submenu
                        ? () =>
                              debouncer(() => {
                                  const child = commandLevels[level + 1];
                                  if (
                                      !child?.contains(document.activeElement)
                                  ) {
                                      closeCommandSubmenus(level + 1);
                                  }
                              })
                        : nothing
                }
                @click=${(/** @type {MouseEvent} */ event) => {
                    if (disabled) {
                        return;
                    }
                    if (submenu) {
                        void openCommandSubmenu(
                            item,
                            /** @type {HTMLElement} */ (event.currentTarget),
                            level + 1,
                            true
                        );
                    } else {
                        clearMenu(undefined, true);
                        item.callback();
                    }
                }}
            >
                <span>
                    ${
                        item.icon
                            ? html`<span aria-hidden="true"
                                  >${icon(item.icon).node[0]}</span
                              >`
                            : nothing
                    }
                    ${label}
                </span>
                ${
                    item.shortcut
                        ? html`<span class="kbd-shortcut" aria-hidden="true"
                              >${item.shortcut}</span
                          >`
                        : nothing
                }
            </button>
        </li>
    `;
}

/**
 * @param {MenuItem[]} items
 * @param {HTMLElement | VirtualElement} opener
 * @param {number} level
 * @param {string} label
 * @param {import("@floating-ui/core").Placement} placement
 * @param {boolean} focus
 */
function renderCommandLevel(items, opener, level, label, placement, focus) {
    closeCommandSubmenus(level);

    const menu = document.createElement("ul");
    menu.className = "gs-context-menu";
    menu.id = `gs-command-menu-${++nextMenuId}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    menu.tabIndex = -1;
    menu.style.top = "0";
    menu.addEventListener("mouseenter", () => debouncer(() => {}));
    menu.addEventListener("mouseup", (event) => event.stopPropagation());
    menu.addEventListener("click", (event) => event.stopPropagation());
    menu.addEventListener("keydown", (event) =>
        handleCommandKeydown(event, level)
    );
    render(
        items.map((item) => commandItemToTemplate(item, level)),
        menu
    );

    backdropElement.append(menu);
    commandLevels[level] = menu;

    const adjust = !/^(top|bottom)/.test(placement);
    computePosition(opener, menu, {
        strategy: "fixed",
        placement,
        middleware: level === 0 && adjust ? [offset(2), flip()] : [flip()],
    }).then(({ x, y }) => {
        if (!menu.isConnected) {
            return;
        }
        const first = /** @type {HTMLElement | null} */ (
            menu.querySelector(":scope > li")
        );
        if (first && adjust) {
            y -= first.getBoundingClientRect().top;
        }
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    });

    if (focus) {
        focusCommandItem(menu);
    }
    return menu;
}

/**
 * @param {MenuItem} item
 * @param {HTMLElement} trigger
 * @param {number} level
 * @param {boolean} focus
 */
async function openCommandSubmenu(item, trigger, level, focus) {
    if (commandTriggers[level] === trigger && commandLevels[level]) {
        if (focus) {
            focusCommandItem(commandLevels[level]);
        }
        return;
    }

    const request = Symbol();
    submenuRequests.set(trigger, request);
    /** @type {MenuItem[] | Promise<MenuItem[]>} */
    let source;
    try {
        source =
            typeof item.submenu === "function" ? item.submenu() : item.submenu;
    } catch {
        source = Promise.reject(new Error("Could not open submenu."));
    }
    const asyncSource = source instanceof Promise;
    const menu = renderCommandLevel(
        asyncSource
            ? [{ label: "Loading..." }]
            : /** @type {MenuItem[]} */ (source),
        trigger,
        level,
        String(item.label || "Submenu"),
        "right-start",
        focus
    );
    commandTriggers[level] = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", menu.id);
    trigger.closest("li")?.classList.add("active");

    if (!asyncSource) {
        return;
    }

    try {
        const items = await source;
        if (submenuRequests.get(trigger) !== request || !menu.isConnected) {
            return;
        }
        const focusWasInside = menu.contains(document.activeElement);
        render(
            items.map((child) => commandItemToTemplate(child, level)),
            menu
        );
        if (focusWasInside) {
            focusCommandItem(menu);
        }
    } catch {
        if (submenuRequests.get(trigger) !== request || !menu.isConnected) {
            return;
        }
        render(
            commandItemToTemplate({ label: "Could not open submenu." }, level),
            menu
        );
    }
}

/**
 * @param {KeyboardEvent} event
 * @param {number} level
 */
function handleCommandKeydown(event, level) {
    const menu = commandLevels[level];
    const items = Array.from(
        menu.querySelectorAll(":scope > li > [role='menuitem']")
    );
    const index = items.indexOf(document.activeElement);
    const focused = /** @type {HTMLElement | undefined} */ (items[index]);

    if (event.key === "Tab") {
        event.preventDefault();
        moveFocusOutsideMenu(event.shiftKey);
        return;
    }
    if (event.key === "Escape" || (event.key === "ArrowLeft" && level > 0)) {
        event.preventDefault();
        if (level > 0) {
            const trigger = commandTriggers[level];
            closeCommandSubmenus(level);
            trigger.focus();
        } else {
            clearMenu(undefined, true);
        }
        return;
    }

    /** @type {number | undefined} */
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp")
        next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next !== undefined) {
        event.preventDefault();
        /** @type {HTMLElement | undefined} */ (items[next])?.focus();
        return;
    }

    if (event.key === "ArrowRight" && focused?.hasAttribute("aria-haspopup")) {
        event.preventDefault();
        focused.click();
    } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focused?.click();
    }
}

/** @param {boolean} backwards */
function moveFocusOutsideMenu(backwards) {
    const anchor = rootTrigger ?? returnFocus;
    const candidates = Array.from(
        document.querySelectorAll(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"
        )
    ).filter(
        (element) =>
            !element.closest(".gs-context-menu-backdrop") &&
            getComputedStyle(element).display !== "none"
    );
    const index = candidates.indexOf(anchor);
    const target = candidates[index + (backwards ? -1 : 1)] ?? anchor;
    clearMenu();
    if (target instanceof HTMLElement) {
        target.focus();
    }
}
/**
 *
 * @param {MenuOptions} options
 * @param {HTMLElement | VirtualElement} openerElement
 * @param {import("@floating-ui/core").Placement} [placement]
 */
export function dropdownMenu(options, openerElement, placement) {
    placement ??= "bottom-start";
    const mode = options.mode ?? "controls";

    // Create new or just update?
    if (
        backdropElement &&
        (lastOpener !== openerElement || currentMode !== mode)
    ) {
        clearMenu();
    }
    lastOpener = openerElement;

    if (!backdropElement) {
        currentMode = mode;
        returnFocus =
            openerElement instanceof HTMLElement
                ? openerElement
                : document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
        prepareBackdrop();
        if (mode === "command") {
            if (openerElement instanceof HTMLElement) {
                rootTrigger = openerElement;
                rootTrigger.setAttribute("aria-haspopup", "menu");
                rootTrigger.setAttribute("aria-expanded", "true");
            }
            const menu = renderCommandLevel(
                options.items,
                openerElement,
                0,
                options.label ??
                    rootTrigger?.getAttribute("aria-label") ??
                    rootTrigger?.getAttribute("title") ??
                    rootTrigger?.textContent?.trim() ??
                    "Context menu",
                placement,
                true
            );
            rootTrigger?.setAttribute("aria-controls", menu.id);
        } else {
            renderAndPositionMenu(options.items, openerElement, 0, placement);
        }
    } else {
        // Update existing menu
        const level = 0;
        if (mode === "command") {
            const activeLabel = document.activeElement?.textContent?.trim();
            closeCommandSubmenus(1);
            render(
                options.items.map((item) => commandItemToTemplate(item, level)),
                commandLevels[0]
            );
            const replacement = Array.from(
                commandLevels[0].querySelectorAll(
                    ":scope > li > [role='menuitem']"
                )
            ).find((item) => item.textContent?.trim() === activeLabel);
            if (replacement instanceof HTMLElement) {
                replacement.focus();
            }
        } else {
            render(
                options.items.map((item) => menuItemToTemplate(item, level)),
                openLevels[0]
            );
        }
    }
}

/**
 * @param {MenuOptions} options
 * @param {MouseEvent} mouseEvent
 */
export function contextMenu(options, mouseEvent) {
    dropdownMenu(
        { ...options, mode: "command", label: options.label ?? "Context menu" },
        getVirtualElement(mouseEvent),
        "right-start"
    );
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
