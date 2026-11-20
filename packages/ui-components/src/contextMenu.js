import { html, nothing, render } from "lit";
import {
    autoUpdate,
    computePosition,
    flip,
    offset,
    shift,
} from "@floating-ui/dom";
import { faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { renderIcon } from "./icon.js";

/**
 * @typedef {Object} MenuItemContent
 * @prop {import("lit").TemplateResult} [customContent] Content for controls mode.
 * @prop {string | import("lit").TemplateResult} [label]
 * @prop {() => void} [callback] Runs after the popup closes.
 * @prop {string} [shortcut] Shortcut key. Just for displaying.
 * @prop {MenuItem[]} [ellipsisSubmenu] Secondary actions for the same item.
 * @prop {boolean} [current] Current item in a history menu.
 * @prop {boolean} [disabled] Disable the row's generated actions.
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 * @prop {MenuItem[] | (() => MenuItem[] | Promise<MenuItem[]>)} [submenu]
 * @prop {string} [key] Unique identity within a popup level for preserving focus on updates.
 *
 * Plain actions, headings, and dividers work in both modes. Groups, checkable
 * actions, and native links belong to command menus.
 *
 * @typedef {MenuItemContent & (
 *     | {type?: "divider" | "header"}
 *     | {type: "group", label: string, items: MenuItem[], callback?: never, submenu?: never, ellipsisSubmenu?: never}
 *     | {type: "radio" | "checkbox", checked: boolean, submenu?: never}
 *     | {type: "link", href: string, target?: string, callback?: never, submenu?: never, ellipsisSubmenu?: never}
 * )} MenuItem
 *
 * @typedef {Object} MenuOptions
 * @prop {MenuItem[]} items
 * @prop {"command" | "controls"} [mode] Anchored popups default to controls.
 * @prop {string} [label] Accessible name for the popup.
 * @prop {"first" | "last" | "checked"} [initialFocus] Where command menus place focus on opening.
 * If no item is checked, "checked" focuses the first item.
 * @prop {HTMLElement} [interactionBoundary] Focus can move into this element
 * without dismissing the popup. Place its controls above the backdrop to keep
 * them clickable while the popup is open.
 *
 * @typedef {Object} VirtualElement
 * @prop {() => DOMRect} getBoundingClientRect
 */

/** @type {MenuItem} */
export const DIVIDER = { type: "divider" };

let nextMenuId = 0;

/**
 * Creates a controller for one popup menu at a time. Open with `contextMenu`
 * at a pointer event or with `dropdownMenu` at an anchor. Calling
 * `dropdownMenu` again for the same anchor and mode updates the open popup.
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.mount] Connected light DOM container for the fixed popup
 * and backdrop in the current document. Defaults to `document.body`. Call
 * `dismissDropdownMenu()` before removing a custom mount.
 * @param {() => (() => void) | void} [options.onOpen] Called when a root popup
 * opens. Return a cleanup function to run on dismissal, before focus returns.
 * @param {boolean} [options.lightDismiss] Dismiss on outside pointer presses and
 * allow the pressed control to receive the interaction.
 */
export function createMenuController({
    mount,
    onOpen,
    lightDismiss = false,
} = {}) {
    /** @type {HTMLElement} */
    let backdropElement;

    /** @type {HTMLElement} */
    let popupLayerElement;

    /** @type {HTMLElement[]} */
    const levels = [];

    /** @type {HTMLElement[]} */
    const triggers = [];

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

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let submenuTimeout;

    /** @type {(() => void) | void} */
    let onClose;

    /** @type {WeakMap<HTMLElement, () => void>} */
    const positionCleanups = new WeakMap();

    /** @param {() => void} callback */
    function scheduleSubmenu(callback) {
        clearTimeout(submenuTimeout);
        submenuTimeout = setTimeout(callback, 150);
    }

    /**
     * Returns true if a menu is visible
     */
    function isContextMenuOpen() {
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
            clearTimeout(submenuTimeout);
            closeSubmenus(0);
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
            document.removeEventListener(
                "pointerdown",
                handleOutsidePointer,
                true
            );
            lastOpener = undefined;
            currentMode = undefined;

            const cleanup = onClose;
            onClose = undefined;
            if (typeof cleanup === "function") {
                cleanup();
            }

            if (restoreFocus && returnFocus?.isConnected) {
                returnFocus.focus();
            }
            returnFocus = null;
        }
    }

    /** @param {FocusEvent} event */
    function handleOutsideFocus(event) {
        const path = event.composedPath();
        if (
            backdropElement &&
            !path.includes(rootTrigger) &&
            !path.includes(interactionBoundary) &&
            !path.includes(popupLayerElement)
        ) {
            clearMenu();
        }
    }

    /** @param {PointerEvent} event */
    function handleOutsidePointer(event) {
        const path = event.composedPath();
        if (!path.includes(rootTrigger) && !path.includes(popupLayerElement)) {
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
    function isDropdownOpenFor(opener) {
        return Boolean(backdropElement && lastOpener === opener);
    }

    function dismissDropdownMenu() {
        clearMenu(undefined, true);
    }

    /** @type {HTMLElement | VirtualElement | undefined} */
    let lastOpener;

    function prepareMenuLayers() {
        const container = mount ?? document.body;
        onClose = onOpen?.();
        const openedAt = performance.now();

        backdropElement = document.createElement("div");
        backdropElement.classList.add("gs-context-menu-backdrop");

        if (lightDismiss) {
            backdropElement.style.pointerEvents = "none";
            document.addEventListener(
                "pointerdown",
                handleOutsidePointer,
                true
            );
        } else {
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
        }
        container.appendChild(backdropElement);
        popupLayerElement = document.createElement("div");
        popupLayerElement.className = "gs-context-menu-popup-layer";
        popupLayerElement.addEventListener("contextmenu", (event) => {
            if (!(
                event.target instanceof Element &&
                event.target.closest("a[href]")
            )) {
                clearMenu(event);
            }
        });
        container.appendChild(popupLayerElement);
        document.addEventListener("focusin", handleOutsideFocus);
        document.addEventListener("keydown", handleDocumentKeydown);
    }

    /**
     * @param {number} fromLevel
     */
    function closeSubmenus(fromLevel) {
        if (fromLevel >= levels.length) {
            return;
        }
        for (let level = fromLevel; level < levels.length; level++) {
            const popup = levels[level];
            if (popup) {
                positionCleanups.get(popup)?.();
                positionCleanups.delete(popup);
                popup.remove();
            }
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

    /**
     * @param {HTMLElement} popup
     * @param {HTMLElement | VirtualElement} opener
     * @param {number} level
     * @param {import("@floating-ui/dom").Placement} placement
     */
    function mountPopup(popup, opener, level, placement) {
        popup.style.top = "0";
        popup.addEventListener("mouseenter", () =>
            clearTimeout(submenuTimeout)
        );
        popup.addEventListener("mouseup", (event) => event.stopPropagation());
        popup.addEventListener("click", (event) => event.stopPropagation());
        popupLayerElement.append(popup);

        const adjust = !/^(top|bottom)/.test(placement);
        const middleware =
            level === 0 && adjust ? [offset(2), flip()] : [flip()];
        if (!adjust) {
            middleware.push(shift({ padding: 4 }));
        }
        const update = () => {
            void computePosition(opener, popup, {
                strategy: "fixed",
                placement,
                middleware,
            }).then(({ x, y }) => {
                if (!popup.isConnected) {
                    return;
                }
                const first = popup.querySelector("li");
                if (first && adjust) {
                    y -=
                        first.getBoundingClientRect().top -
                        popup.getBoundingClientRect().top +
                        popup.scrollTop;
                }
                popup.style.left = `${x}px`;
                popup.style.top = `${y}px`;
            });
        };
        if (opener instanceof HTMLElement) {
            positionCleanups.set(popup, autoUpdate(opener, popup, update));
        } else {
            update();
        }
    }

    /** @param {HTMLElement} menu */
    function commandItems(menu) {
        return Array.from(
            menu.querySelectorAll(
                "[role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox']"
            )
        );
    }

    /** @param {Element} item */
    function commandLabel(item) {
        return (
            item.getAttribute("aria-label") ??
            item.querySelector(".menu-item-label")?.textContent?.trim()
        );
    }

    /**
     * @param {HTMLElement} menu
     * @param {MenuOptions["initialFocus"]} [initialFocus]
     */
    function focusCommandItem(menu, initialFocus = "first") {
        const items = commandItems(menu);
        const item =
            initialFocus === "last"
                ? items.at(-1)
                : initialFocus === "checked"
                  ? (items.find(
                        (item) => item.getAttribute("aria-checked") === "true"
                    ) ?? items[0])
                  : items[0];
        if (item instanceof HTMLElement) {
            item.focus();
        } else {
            menu.focus();
        }
    }

    /**
     * @param {MenuItem} item
     * @param {number} level
     * @returns {import("lit").HTMLTemplateResult}
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

        if (item.type === "group") {
            if (typeof item.label !== "string" || !Array.isArray(item.items)) {
                throw new TypeError(
                    "A menu group requires a text label and an items array."
                );
            }
            return html`
                <li role="none" class="menu-group">
                    <div class="menu-header" aria-hidden="true">
                        ${item.label}
                    </div>
                    <ul role="group" aria-label=${item.label}>
                        ${item.items.map((child) => commandItemToTemplate(child, level))}
                    </ul>
                </li>
            `;
        }

        const label = item.label || "-";
        const submenu = Boolean(item.submenu);
        const checkable = item.type === "radio" || item.type === "checkbox";
        const leading =
            checkable && item.checked
                ? html`<span class="menu-check">✓</span>`
                : item.icon
                  ? renderIcon(item.icon)
                  : nothing;
        const content = html`
            <span>
                ${
                    checkable || item.icon
                        ? html`<span
                              class="menu-item-leading"
                              aria-hidden="true"
                              >${leading}</span
                          >`
                        : nothing
                }
                <span class="menu-item-label">${label}</span>
            </span>
        `;
        if (item.type === "link") {
            return html`
                <li role="none" class="menu-item-row">
                    <a
                        class=${item.disabled ? "disabled-item" : "choice-item"}
                        role="menuitem"
                        tabindex="-1"
                        data-menu-key=${item.key ?? nothing}
                        href=${item.disabled ? nothing : item.href}
                        target=${item.target ?? nothing}
                        rel=${item.target === "_blank" ? "noopener" : nothing}
                        aria-disabled=${item.disabled ? "true" : nothing}
                        @click=${dismissAfterLinkActivation}
                        @auxclick=${dismissAfterLinkActivation}
                        >${content}</a
                    >
                </li>
            `;
        }
        const disabled = item.disabled || (!submenu && !item.callback);
        return html`
            <li role="none" class="menu-item-row">
                <button
                    type="button"
                    role=${checkable ? "menuitem" + item.type : "menuitem"}
                    class=${
                        submenu
                            ? "submenu-item"
                            : disabled
                              ? "disabled-item"
                              : "choice-item"
                    }
                    tabindex="-1"
                    data-menu-key=${item.key ?? nothing}
                    aria-haspopup=${submenu ? "menu" : nothing}
                    aria-expanded=${submenu ? "false" : nothing}
                    aria-disabled=${disabled ? "true" : nothing}
                    aria-checked=${checkable ? String(!!item.checked) : nothing}
                    aria-current=${item.current ? "step" : nothing}
                    @mouseenter=${
                        submenu && !disabled
                            ? (/** @type {MouseEvent} */ event) => {
                                  const trigger = /** @type {HTMLElement} */ (
                                      event.currentTarget
                                  );
                                  scheduleSubmenu(() => {
                                      void openSubmenu(
                                          item,
                                          trigger,
                                          level + 1,
                                          false
                                      );
                                  });
                              }
                            : nothing
                    }
                    @mouseleave=${
                        submenu
                            ? () =>
                                  scheduleSubmenu(() => {
                                      const child = levels[level + 1];
                                      if (
                                          !child?.contains(
                                              document.activeElement
                                          )
                                      ) {
                                          closeSubmenus(level + 1);
                                      }
                                  })
                            : nothing
                    }
                    @click=${(/** @type {MouseEvent} */ event) => {
                        if (disabled) {
                            return;
                        }
                        if (submenu) {
                            void openSubmenu(
                                item,
                                /** @type {HTMLElement} */ (
                                    event.currentTarget
                                ),
                                level + 1,
                                true
                            );
                        } else {
                            clearMenu(undefined, true);
                            item.callback();
                        }
                    }}
                >
                    ${content}
                    ${
                        item.shortcut
                            ? html`<span class="kbd-shortcut" aria-hidden="true"
                                  >${item.shortcut}</span
                              >`
                            : nothing
                    }
                </button>
                ${
                    item.ellipsisSubmenu && !item.disabled
                        ? html`<button
                              type="button"
                              role="menuitem"
                              tabindex="-1"
                              class="menu-ellipsis"
                              aria-label=${`Actions for ${label}`}
                              aria-haspopup="menu"
                              aria-expanded="false"
                              @click=${(/** @type {MouseEvent} */ event) => {
                                  void openSubmenu(
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
                                  >${renderIcon(faEllipsisV)}</span
                              >
                          </button>`
                        : nothing
                }
            </li>
        `;
    }

    /** @param {MouseEvent} event */
    function dismissAfterLinkActivation(event) {
        const link = /** @type {HTMLAnchorElement} */ (event.currentTarget);
        if (event.button > 1 || !link.hasAttribute("href")) {
            return;
        }
        const layer = popupLayerElement;
        // Let the anchor perform its native navigation before removing it.
        setTimeout(() => {
            if (popupLayerElement === layer) {
                clearMenu(undefined, true);
            }
        }, 0);
    }

    /**
     * @param {MenuItem[]} items
     * @param {HTMLElement | VirtualElement} opener
     * @param {number} level
     * @param {string} label
     * @param {import("@floating-ui/dom").Placement} placement
     * @param {false | MenuOptions["initialFocus"]} focus
     */
    function renderCommandLevel(items, opener, level, label, placement, focus) {
        closeSubmenus(level);

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
        levels[level] = menu;

        if (focus) {
            focusCommandItem(menu, focus);
        }
        return menu;
    }

    /**
     * @param {MenuItem} item
     * @param {HTMLElement} trigger
     * @param {number} level
     * @param {boolean} focus
     */
    async function openSubmenu(item, trigger, level, focus) {
        if (
            !trigger.isConnected ||
            trigger.matches(':disabled, [aria-disabled="true"]')
        ) {
            return;
        }

        const command = currentMode === "command";
        const focusItem = command ? focusCommandItem : focusControl;
        if (triggers[level] === trigger && levels[level]) {
            if (focus) {
                focusItem(levels[level]);
            }
            return;
        }

        const request = Symbol();
        submenuRequests.set(trigger, request);
        const label = command
            ? commandLabel(trigger)?.replace(/\s+/g, " ") || "Submenu"
            : String(item.label || "Settings");
        const unavailable = [
            {
                label: command
                    ? "Could not open submenu."
                    : "Could not open settings.",
            },
        ];

        /** @param {MenuItem[]} items */
        const mount = (items) =>
            command
                ? renderCommandLevel(
                      items,
                      trigger,
                      level,
                      label,
                      "right-start",
                      focus ? "first" : false
                  )
                : renderControlLevel(
                      items,
                      trigger,
                      level,
                      label,
                      "right-start",
                      focus
                  );

        /** @type {MenuItem[] | Promise<MenuItem[]>} */
        let source;
        /** @type {HTMLElement} */
        let popup;
        try {
            source =
                typeof item.submenu === "function"
                    ? item.submenu()
                    : item.submenu;
            popup = mount(
                source instanceof Promise ? [{ label: "Loading..." }] : source
            );
        } catch {
            source = unavailable;
            popup = mount(unavailable);
        }

        triggers[level] = trigger;
        trigger.setAttribute("aria-expanded", "true");
        trigger.setAttribute("aria-controls", popup.id);
        trigger.closest("li")?.classList.add("active");

        if (!(source instanceof Promise)) {
            return;
        }

        const items = await source.catch(() => unavailable);
        if (submenuRequests.get(trigger) !== request || !popup.isConnected) {
            return;
        }

        /** @param {MenuItem[]} items */
        const content = (items) =>
            command
                ? items.map((child) => commandItemToTemplate(child, level))
                : controlPanelContent(items, level);
        const focusWasInside = popup.contains(document.activeElement);
        try {
            render(content(items), popup);
        } catch {
            render(content(unavailable), popup);
        }
        if (focusWasInside) {
            focusItem(popup);
        }
    }

    /**
     * @param {KeyboardEvent} event
     * @param {number} level
     */
    function handleCommandKeydown(event, level) {
        const menu = levels[level];
        const items = commandItems(menu);
        const index = items.indexOf(document.activeElement);
        const focused = /** @type {HTMLElement | undefined} */ (items[index]);

        if (event.key === "Tab") {
            moveFocusOutsideMenu(event);
            return;
        }
        if (
            event.key === "Escape" ||
            (event.key === "ArrowLeft" && level > 0)
        ) {
            event.preventDefault();
            if (level > 0) {
                const trigger = triggers[level];
                closeSubmenus(level);
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

        if (
            event.key === "ArrowRight" &&
            focused?.hasAttribute("aria-haspopup")
        ) {
            event.preventDefault();
            focused.click();
        } else if (
            event.key === " " ||
            (event.key === "Enter" && !(focused instanceof HTMLAnchorElement))
        ) {
            event.preventDefault();
            focused?.click();
        }
    }

    /** @param {KeyboardEvent} event */
    function moveFocusOutsideMenu(event) {
        const anchor = rootTrigger ?? returnFocus;
        if (anchor?.getRootNode() instanceof ShadowRoot) {
            // From the shadow trigger, the browser can follow the composed tab order.
            clearMenu(undefined, true);
            return;
        }
        event.preventDefault();
        const backwards = event.shiftKey;
        const candidates = Array.from(
            document.querySelectorAll(
                "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"
            )
        ).filter((element) => {
            if (element.closest(".gs-context-menu-popup-layer")) return false;
            for (
                let ancestor = element;
                ancestor;
                ancestor = ancestor.parentElement
            ) {
                const style = getComputedStyle(ancestor);
                if (
                    ancestor.hasAttribute("inert") ||
                    style.display === "none" ||
                    style.visibility === "hidden"
                ) {
                    return false;
                }
            }
            return true;
        });
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
        if (item.type !== undefined) {
            throw new TypeError(
                `Menu item type "${item.type}" requires command mode.`
            );
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
                      item.customContent
                          ? `Settings for ${item.label}`
                          : nothing
                  }
                  aria-haspopup="dialog"
                  aria-expanded="false"
                  ?disabled=${item.disabled}
                  @click=${(/** @type {MouseEvent} */ event) => {
                      if (item.disabled) {
                          return;
                      }
                      void openSubmenu(
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
                submenu && !item.disabled
                    ? (/** @type {MouseEvent} */ event) => {
                          const trigger = /** @type {HTMLElement} */ (
                              /** @type {HTMLElement} */ (
                                  event.currentTarget
                              ).querySelector("button[aria-haspopup='dialog']")
                          );
                          scheduleSubmenu(() => {
                              void openSubmenu(item, trigger, level + 1, false);
                          });
                      }
                    : nothing
            }
            @mouseleave=${
                submenu
                    ? () =>
                          scheduleSubmenu(() => {
                              const child = levels[level + 1];
                              if (!child?.contains(document.activeElement)) {
                                  closeSubmenus(level + 1);
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
                            ?disabled=${item.disabled}
                            @click=${() => {
                                if (item.disabled) {
                                    return;
                                }
                                clearMenu(undefined, true);
                                item.callback();
                            }}
                        >
                            ${
                                item.icon
                                    ? html`<span
                                          class="menu-item-icon"
                                          aria-hidden="true"
                                          >${renderIcon(item.icon)}</span
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
     * @param {import("@floating-ui/dom").Placement} placement
     * @param {boolean} focus
     */
    function renderControlLevel(items, opener, level, label, placement, focus) {
        closeSubmenus(level);

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
        levels[level] = panel;

        if (focus) {
            focusControl(panel);
        }
        return panel;
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
                const trigger = triggers[level];
                closeSubmenus(level);
                trigger.focus();
            } else {
                clearMenu(undefined, true);
            }
        } else if (event.key === "Tab") {
            const controls = Array.from(
                popupLayerElement.querySelectorAll(
                    ".gs-controls-popup button:not([disabled]), .gs-controls-popup input:not([disabled]), .gs-controls-popup select:not([disabled]), .gs-controls-popup textarea:not([disabled])"
                )
            );
            /** @type {Map<string, HTMLInputElement>} */
            const radioGroups = new Map();
            for (const control of controls) {
                if (
                    control instanceof HTMLInputElement &&
                    control.type === "radio" &&
                    control.name &&
                    (control.checked || !radioGroups.has(control.name))
                ) {
                    radioGroups.set(control.name, control);
                }
            }
            const focusables = controls.filter(
                (control) =>
                    !(control instanceof HTMLInputElement) ||
                    control.type !== "radio" ||
                    !control.name ||
                    radioGroups.get(control.name) === control
            );
            const current = focusables.indexOf(document.activeElement);
            if (
                current === -1 ||
                (event.shiftKey && current === 0) ||
                (!event.shiftKey && current === focusables.length - 1)
            ) {
                moveFocusOutsideMenu(event);
            }
        }
    }
    /**
     *
     * @param {MenuOptions} options
     * @param {HTMLElement | VirtualElement} openerElement
     * @param {import("@floating-ui/dom").Placement} [placement]
     */
    function dropdownMenu(options, openerElement, placement) {
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
            try {
                prepareMenuLayers();
                if (openerElement instanceof HTMLElement) {
                    rootTrigger = openerElement;
                    rootTrigger.setAttribute(
                        "aria-haspopup",
                        mode === "command" ? "menu" : "dialog"
                    );
                    rootTrigger.setAttribute("aria-expanded", "true");
                }
                const popup =
                    mode === "command"
                        ? renderCommandLevel(
                              options.items,
                              openerElement,
                              0,
                              options.label ??
                                  rootTrigger?.getAttribute("aria-label") ??
                                  rootTrigger?.getAttribute("title") ??
                                  rootTrigger?.textContent?.trim() ??
                                  "Context menu",
                              placement,
                              options.initialFocus ?? "first"
                          )
                        : renderControlLevel(
                              options.items,
                              openerElement,
                              0,
                              options.label ?? "Settings",
                              placement,
                              true
                          );
                if (rootTrigger?.getRootNode() === popup.getRootNode()) {
                    rootTrigger.setAttribute("aria-controls", popup.id);
                }
            } catch (error) {
                clearMenu(undefined, true);
                throw error;
            }
        } else {
            // Updates can change the availability of a pending hover action.
            clearTimeout(submenuTimeout);
            interactionBoundary = options.interactionBoundary ?? null;
            const level = 0;
            if (options.label) {
                levels[0].setAttribute("aria-label", options.label);
            }
            if (mode === "command") {
                const focusedInMenu = levels[0].contains(
                    document.activeElement
                );
                const focusedInChild = levels
                    .slice(1)
                    .some((menu) => menu.contains(document.activeElement));
                const active = focusedInMenu ? document.activeElement : null;
                const activeKey = active?.getAttribute("data-menu-key");
                const activeLabel = active ? commandLabel(active) : undefined;
                closeSubmenus(1);
                render(
                    options.items.map((item) =>
                        commandItemToTemplate(item, level)
                    ),
                    levels[0]
                );
                const replacement = commandItems(levels[0]).find((item) =>
                    activeKey !== null && activeKey !== undefined
                        ? item.getAttribute("data-menu-key") === activeKey
                        : activeLabel !== undefined &&
                          commandLabel(item) === activeLabel
                );
                if (focusedInMenu || focusedInChild) {
                    if (replacement instanceof HTMLElement) {
                        replacement.focus();
                    } else {
                        focusCommandItem(levels[0], options.initialFocus);
                    }
                }
            } else {
                const focusedKey =
                    document.activeElement instanceof HTMLElement
                        ? document.activeElement.dataset.controlKey
                        : undefined;
                const panel = levels[0];
                closeSubmenus(1);
                render(controlPanelContent(options.items, level), panel);
                if (focusedKey) {
                    const replacement = Array.from(
                        panel.querySelectorAll("[data-control-key]")
                    ).find(
                        (element) =>
                            /** @type {HTMLElement} */ (element).dataset
                                .controlKey === focusedKey
                    );
                    if (
                        replacement instanceof HTMLElement &&
                        !replacement.matches(":disabled")
                    ) {
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
    function contextMenu(options, mouseEvent) {
        dropdownMenu(
            {
                ...options,
                mode: "command",
                label: options.label ?? "Context menu",
            },
            getVirtualElement(mouseEvent),
            "right-start"
        );
        mouseEvent.preventDefault();
    }

    return {
        contextMenu,
        dropdownMenu,
        isContextMenuOpen,
        isDropdownOpenFor,
        dismissDropdownMenu,
    };
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
