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
 * @prop {MenuItem[]} [ellipsisSubmenu] Secondary actions for the same item.
 * @prop {boolean} [current] Current item in a history menu.
 * @prop {"divider" | "header" | undefined} [type]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 * @prop {MenuItem[] | (() => MenuItem[] | Promise<MenuItem[]>)} [submenu]
 * @prop {string} [key] Stable identity for controls that can be re-rendered.
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 * @prop {"command" | "controls"} [mode]
 * @prop {string} [label]
 * @prop {HTMLElement} [interactionBoundary] An element whose controls keep the popup open.
 *
 * @typedef {Object} VirtualElement
 * @prop {() => DOMRect} getBoundingClientRect
 */

/** @type {HTMLElement} */
let backdropElement;

/** @type {HTMLElement} */
let popupLayerElement;

/** @type {HTMLElement[]} */
const commandLevels = [];

/** @type {HTMLElement[]} */
const commandTriggers = [];

/** @type {HTMLElement[]} */
const controlLevels = [];

/** @type {HTMLElement[]} */
const controlTriggers = [];

/** @type {WeakMap<HTMLElement, symbol>} */
const submenuRequests = new WeakMap();

/** @type {HTMLElement | null} */
let returnFocus = null;

/** @type {HTMLElement | null} */
let rootTrigger = null;

/** @type {HTMLElement | null} */
let interactionBoundary = null;

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
    }

    if (backdropElement) {
        debouncer(() => {});
        closeCommandSubmenus(1);
        closeControlSubmenus(1);
        commandLevels.length = 0;
        controlLevels.length = 0;
        rootTrigger?.setAttribute("aria-expanded", "false");
        rootTrigger?.removeAttribute("aria-controls");
        rootTrigger = null;
        interactionBoundary = null;
        popupLayerElement.remove();
        popupLayerElement = undefined;
        backdropElement.remove();
        backdropElement = undefined;
        document.removeEventListener("focusin", handleOutsideFocus);
        document.removeEventListener("keydown", handleDocumentKeydown);
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

/** @param {FocusEvent} event */
function handleOutsideFocus(event) {
    if (
        backdropElement &&
        event.target !== rootTrigger &&
        !interactionBoundary?.contains(/** @type {Node} */ (event.target)) &&
        !popupLayerElement.contains(/** @type {Node} */ (event.target))
    ) {
        clearMenu();
    }
}

/** @param {KeyboardEvent} event */
function handleDocumentKeydown(event) {
    if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        backdropElement &&
        !event.composedPath().includes(popupLayerElement)
    ) {
        event.preventDefault();
        clearMenu(undefined, true);
    }
}

/** @param {Element} opener */
export function isDropdownOpenFor(opener) {
    return Boolean(backdropElement && lastOpener === opener);
}

export function dismissDropdownMenu() {
    clearMenu(undefined, true);
}

/** @type {HTMLElement | VirtualElement | undefined} */
let lastOpener;

function prepareMenuLayers() {
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
    popupLayerElement = document.createElement("div");
    popupLayerElement.className = "gs-context-menu-popup-layer";
    popupLayerElement.addEventListener("contextmenu", clearMenu);
    container.appendChild(popupLayerElement);
    document.addEventListener("focusin", handleOutsideFocus);
    document.addEventListener("keydown", handleDocumentKeydown);

    document.body.classList.add(SUPPRESS_TOOLTIP_CLASS_NAME);
    document.body.classList.add(FREEZE_INTERACTION_CLASS_NAME);
}

/**
 * @param {number} fromLevel
 * @param {HTMLElement[]} levels
 * @param {HTMLElement[]} triggers
 */
function closeSubmenus(fromLevel, levels, triggers) {
    if (fromLevel >= levels.length) {
        return;
    }
    for (let level = fromLevel; level < levels.length; level++) {
        levels[level]?.remove();
        const trigger = triggers[level];
        if (trigger) {
            submenuRequests.delete(trigger);
            trigger.setAttribute("aria-expanded", "false");
            trigger.removeAttribute("aria-controls");
            trigger.closest("li")?.classList.remove("active");
        }
    }
    levels.length = fromLevel;
    triggers.length = fromLevel;
}

/** @param {number} fromLevel */
function closeCommandSubmenus(fromLevel) {
    closeSubmenus(fromLevel, commandLevels, commandTriggers);
}

/** @param {number} fromLevel */
function closeControlSubmenus(fromLevel) {
    closeSubmenus(fromLevel, controlLevels, controlTriggers);
}

/**
 * @param {HTMLElement} popup
 * @param {HTMLElement | VirtualElement} opener
 * @param {number} level
 * @param {import("@floating-ui/core").Placement} placement
 */
function mountPopup(popup, opener, level, placement) {
    popup.style.top = "0";
    popup.addEventListener("mouseenter", () => debouncer(() => {}));
    popup.addEventListener("mouseup", (event) => event.stopPropagation());
    popup.addEventListener("click", (event) => event.stopPropagation());
    popupLayerElement.append(popup);

    const adjust = !/^(top|bottom)/.test(placement);
    computePosition(opener, popup, {
        strategy: "fixed",
        placement,
        middleware: level === 0 && adjust ? [offset(2), flip()] : [flip()],
    }).then(({ x, y }) => {
        if (!popup.isConnected) {
            return;
        }
        const first = /** @type {HTMLElement | null} */ (
            popup.querySelector("li")
        );
        if (first && adjust) {
            y -= first.getBoundingClientRect().top;
        }
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
    });
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
        return html`<li
            role="separator"
            aria-orientation="horizontal"
            class="menu-divider"
        ></li>`;
    }
    if (item.type === "header") {
        return html`<li
            role="separator"
            aria-orientation="horizontal"
            aria-label=${typeof item.label === "string" ? item.label : nothing}
            class="menu-header"
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
                aria-current=${item.current ? "step" : nothing}
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
                            ? html`<span
                                  class="menu-item-icon"
                                  aria-hidden="true"
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
            ${
                item.ellipsisSubmenu
                    ? html`<button
                          type="button"
                          role="menuitem"
                          tabindex="-1"
                          class="menu-ellipsis"
                          aria-label=${`Actions for ${label}`}
                          aria-haspopup="menu"
                          aria-expanded="false"
                          @click=${(/** @type {MouseEvent} */ event) => {
                              void openCommandSubmenu(
                                  {
                                      label: `Actions for ${label}`,
                                      submenu: item.ellipsisSubmenu,
                                  },
                                  /** @type {HTMLElement} */ (
                                      event.currentTarget
                                  ),
                                  level + 1,
                                  true
                              );
                          }}
                      >
                          <span aria-hidden="true"
                              >${icon(faEllipsisV).node[0]}</span
                          >
                      </button>`
                    : nothing
            }
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
    menu.addEventListener("keydown", (event) =>
        handleCommandKeydown(event, level)
    );
    render(
        items.map((item) => commandItemToTemplate(item, level)),
        menu
    );
    mountPopup(menu, opener, level, placement);
    commandLevels[level] = menu;

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
        trigger.getAttribute("aria-label") ||
            trigger.firstElementChild?.textContent
                ?.replace(/\s+/g, " ")
                .trim() ||
            "Submenu",
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
            !element.closest(".gs-context-menu-popup-layer") &&
            getComputedStyle(element).display !== "none"
    );
    const index = candidates.indexOf(anchor);
    const next =
        index === -1
            ? backwards
                ? candidates.length - 1
                : 0
            : (index + (backwards ? -1 : 1) + candidates.length) %
              candidates.length;
    const target = candidates[next] ?? anchor;
    clearMenu();
    if (target instanceof HTMLElement) {
        target.focus();
    }
}

/** @param {HTMLElement} panel */
function focusControl(panel) {
    const target = /** @type {HTMLElement} */ (
        panel.querySelector(
            "ul input:not([disabled]), ul select:not([disabled]), ul textarea:not([disabled]), ul button:not([disabled])"
        ) ?? panel
    );
    target.focus();
}

/**
 * @param {MenuItem} item
 * @param {number} level
 */
function controlItemToTemplate(item, level) {
    if (item.type === "divider") {
        return html`<li class="menu-divider" aria-hidden="true"></li>`;
    }
    if (item.type === "header") {
        return html`<li class="menu-header">${item.label || "-"}</li>`;
    }

    const submenu = Boolean(item.submenu);
    const disabled = !submenu && !item.callback && !item.customContent;
    const submenuButton = submenu
        ? html`<button
              type="button"
              class=${
                  item.customContent
                      ? "settings-submenu-button"
                      : "submenu-item"
              }
              data-control-key=${item.key ? `${item.key}:settings` : nothing}
              aria-label=${
                  item.customContent ? `Settings for ${item.label}` : nothing
              }
              aria-haspopup="dialog"
              aria-expanded="false"
              @click=${(/** @type {MouseEvent} */ event) => {
                  void openControlSubmenu(
                      item,
                      /** @type {HTMLElement} */ (event.currentTarget),
                      level + 1,
                      true
                  );
              }}
          >
              ${item.customContent ? nothing : item.label}
          </button>`
        : nothing;

    return html`<li
        class=${submenu ? "control-submenu-row" : nothing}
        @mouseenter=${
            submenu
                ? (/** @type {MouseEvent} */ event) => {
                      const trigger = /** @type {HTMLElement} */ (
                          /** @type {HTMLElement} */ (
                              event.currentTarget
                          ).querySelector("button[aria-haspopup='dialog']")
                      );
                      debouncer(() => {
                          if (trigger.isConnected) {
                              void openControlSubmenu(
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
                          const child = controlLevels[level + 1];
                          if (!child?.contains(document.activeElement)) {
                              closeControlSubmenus(level + 1);
                          }
                      })
                : nothing
        }
    >
        ${
            item.customContent
                ? item.customContent
                : item.callback
                  ? html`<button
                        type="button"
                        class="choice-item"
                        data-control-key=${item.key ?? nothing}
                        @click=${() => {
                            clearMenu(undefined, true);
                            item.callback();
                        }}
                    >
                        ${
                            item.icon
                                ? html`<span
                                      class="menu-item-icon"
                                      aria-hidden="true"
                                      >${icon(item.icon).node[0]}</span
                                  >`
                                : nothing
                        }
                        ${item.label}
                    </button>`
                  : disabled
                    ? html`<span class="disabled-item"
                          >${item.label || "-"}</span
                      >`
                    : nothing
        }
        ${submenuButton}
    </li>`;
}

/**
 * @param {MenuItem[]} items
 * @param {number} level
 */
function controlPanelContent(items, level) {
    return html`<ul>
        ${items.map((item) => controlItemToTemplate(item, level))}
    </ul>`;
}

/**
 * @param {MenuItem[]} items
 * @param {HTMLElement | VirtualElement} opener
 * @param {number} level
 * @param {string} label
 * @param {import("@floating-ui/core").Placement} placement
 * @param {boolean} focus
 */
function renderControlLevel(items, opener, level, label, placement, focus) {
    closeControlSubmenus(level);

    const panel = document.createElement("div");
    panel.className = "gs-context-menu gs-controls-popup";
    panel.id = `gs-controls-popup-${++nextMenuId}`;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", label);
    panel.tabIndex = -1;
    panel.addEventListener("keydown", (event) =>
        handleControlKeydown(event, level)
    );
    render(controlPanelContent(items, level), panel);

    mountPopup(panel, opener, level, placement);
    controlLevels[level] = panel;

    if (focus) {
        focusControl(panel);
    }
    return panel;
}

/**
 * @param {MenuItem} item
 * @param {HTMLElement} trigger
 * @param {number} level
 * @param {boolean} focus
 */
async function openControlSubmenu(item, trigger, level, focus) {
    if (controlTriggers[level] === trigger && controlLevels[level]) {
        if (focus) {
            focusControl(controlLevels[level]);
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
        source = Promise.reject(new Error("Could not open settings."));
    }
    const asyncSource = source instanceof Promise;
    const label = String(item.label || "Settings");
    const panel = renderControlLevel(
        asyncSource
            ? [{ label: "Loading..." }]
            : /** @type {MenuItem[]} */ (source),
        trigger,
        level,
        label,
        "right-start",
        focus
    );
    controlTriggers[level] = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", panel.id);
    trigger.closest("li")?.classList.add("active");

    if (!asyncSource) {
        return;
    }
    try {
        const items = await source;
        if (submenuRequests.get(trigger) !== request || !panel.isConnected) {
            return;
        }
        const focusWasInside = panel.contains(document.activeElement);
        render(controlPanelContent(items, level), panel);
        if (focusWasInside) {
            focusControl(panel);
        }
    } catch {
        if (submenuRequests.get(trigger) !== request || !panel.isConnected) {
            return;
        }
        render(
            controlPanelContent([{ label: "Could not open settings." }], level),
            panel
        );
    }
}

/**
 * @param {KeyboardEvent} event
 * @param {number} level
 */
function handleControlKeydown(event, level) {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (level > 0) {
            const trigger = controlTriggers[level];
            closeControlSubmenus(level);
            trigger.focus();
        } else {
            clearMenu(undefined, true);
        }
    } else if (event.key === "Tab") {
        const focusables = Array.from(
            popupLayerElement.querySelectorAll(
                ".gs-controls-popup button:not([disabled]), .gs-controls-popup input:not([disabled]), .gs-controls-popup select:not([disabled]), .gs-controls-popup textarea:not([disabled])"
            )
        );
        const current = focusables.indexOf(document.activeElement);
        if (
            current === -1 ||
            (event.shiftKey && current === 0) ||
            (!event.shiftKey && current === focusables.length - 1)
        ) {
            event.preventDefault();
            moveFocusOutsideMenu(event.shiftKey);
        }
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
        interactionBoundary = options.interactionBoundary ?? null;
        returnFocus =
            openerElement instanceof HTMLElement
                ? openerElement
                : document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
        prepareMenuLayers();
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
            if (openerElement instanceof HTMLElement) {
                rootTrigger = openerElement;
                rootTrigger.setAttribute("aria-haspopup", "dialog");
                rootTrigger.setAttribute("aria-expanded", "true");
            }
            const panel = renderControlLevel(
                options.items,
                openerElement,
                0,
                options.label ?? "Settings",
                placement,
                true
            );
            rootTrigger?.setAttribute("aria-controls", panel.id);
        }
    } else {
        // Update existing menu
        interactionBoundary = options.interactionBoundary ?? null;
        const level = 0;
        if (mode === "command") {
            const focusedInMenu = commandLevels[0].contains(
                document.activeElement
            );
            const activeLabel = focusedInMenu
                ? document.activeElement?.textContent?.trim()
                : undefined;
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
            if (focusedInMenu) {
                if (replacement instanceof HTMLElement) {
                    replacement.focus();
                } else {
                    focusCommandItem(commandLevels[0]);
                }
            }
        } else {
            const focusedKey =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement.dataset.controlKey
                    : undefined;
            const panel = controlLevels[0];
            closeControlSubmenus(1);
            render(controlPanelContent(options.items, level), panel);
            if (focusedKey) {
                const replacement = Array.from(
                    panel.querySelectorAll("[data-control-key]")
                ).find(
                    (element) =>
                        /** @type {HTMLElement} */ (element).dataset
                            .controlKey === focusedKey
                );
                if (replacement instanceof HTMLElement) {
                    replacement.focus();
                } else {
                    focusControl(panel);
                }
            }
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
