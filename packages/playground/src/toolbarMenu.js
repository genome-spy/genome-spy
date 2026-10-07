import { html, nothing } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";

/**
 * @typedef {object} ToolbarAction
 * @property {string} label
 * @property {import("@fortawesome/fontawesome-svg-core").IconDefinition} [icon]
 * @property {() => void} [onClick]
 * @property {string} [href]
 * @property {boolean} [disabled]
 * @property {boolean} [checked]
 */

/**
 * Render the same action in the desktop toolbar or its compact menu.
 * @param {ToolbarAction} action
 * @param {boolean} inMenu
 */
export function toolbarAction(action, inMenu) {
    const content = html`${action.icon ? icon(action.icon).node[0] : nothing}
        <span>${action.label}</span>`;
    const className = inMenu
        ? ""
        : "tool-button hide-mobile" + (action.checked ? " selected" : "");

    if (action.href) {
        return html`<a
            href=${action.href}
            target="_blank"
            class=${className}
            role=${inMenu ? "menuitem" : nothing}
            tabindex=${inMenu ? -1 : nothing}
            >${content}</a
        >`;
    }

    return html`<button
        @click=${action.onClick}
        class=${className}
        role=${
            inMenu
                ? action.checked === undefined
                    ? "menuitem"
                    : "menuitemcheckbox"
                : nothing
        }
        aria-checked=${inMenu ? (action.checked ?? nothing) : nothing}
        aria-pressed=${inMenu ? nothing : (action.checked ?? nothing)}
        tabindex=${inMenu ? -1 : nothing}
        ?disabled=${action.disabled}
    >
        ${content}
    </button>`;
}

/**
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.label
 * @param {import("lit").TemplateResult} options.buttonContent
 * @param {import("lit").TemplateResult} options.items
 * @param {string} options.className
 * @param {string} [options.initialFocusSelector]
 */
export function toolbarMenu({
    id,
    label,
    buttonContent,
    items,
    className,
    initialFocusSelector = '[role^="menuitem"]:not(:disabled)',
}) {
    return html`
        <div class=${"toolbar-menu-selector " + className}>
            <button
                class="tool-button"
                title=${label}
                aria-label=${label}
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls=${id}
                popovertarget=${id}
                @keydown=${(/** @type {KeyboardEvent} */ event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        const button = /** @type {HTMLButtonElement} */ (
                            event.currentTarget
                        );
                        if (
                            !button.nextElementSibling.matches(":popover-open")
                        ) {
                            button.click();
                        }
                    }
                }}
            >
                ${buttonContent}
            </button>
            <div
                id=${id}
                class="toolbar-menu"
                popover="auto"
                role="menu"
                aria-label=${label}
                @toggle=${(/** @type {Event} */ event) => {
                    const menu = /** @type {HTMLElement} */ (
                        event.currentTarget
                    );
                    const open = menu.matches(":popover-open");
                    menu.previousElementSibling.setAttribute(
                        "aria-expanded",
                        String(open)
                    );
                    if (open) {
                        const bounds =
                            menu.previousElementSibling.getBoundingClientRect();
                        menu.style.left =
                            Math.max(
                                4,
                                Math.min(
                                    bounds.left,
                                    window.innerWidth - menu.offsetWidth - 4
                                )
                            ) + "px";
                        menu.style.top = bounds.bottom + "px";
                        const initialItem = /** @type {HTMLElement} */ (
                            menu.querySelector(initialFocusSelector)
                        );
                        initialItem.focus();
                    }
                }}
                @click=${{
                    capture: true,
                    // Close before the action runs, so dialogs can take focus.
                    handleEvent(/** @type {MouseEvent} */ event) {
                        const item = /** @type {Element} */ (
                            event.target
                        ).closest('[role^="menuitem"]');
                        if (item && !item.matches(":disabled")) {
                            closeMenu(
                                /** @type {HTMLElement} */ (event.currentTarget)
                            );
                        }
                    },
                }}
                @keydown=${handleMenuKeydown}
            >
                ${items}
            </div>
        </div>
    `;
}

/** @param {HTMLElement} menu */
function closeMenu(menu) {
    menu.hidePopover();
    /** @type {HTMLElement} */ (menu.previousElementSibling).focus();
}

/** @param {KeyboardEvent} event */
function handleMenuKeydown(event) {
    const menu = /** @type {HTMLElement} */ (event.currentTarget);
    const items = Array.from(
        menu.querySelectorAll('[role^="menuitem"]:not(:disabled)')
    );
    const index = items.indexOf(document.activeElement);
    let nextIndex;
    switch (event.key) {
        case "ArrowDown":
            nextIndex = (index + 1) % items.length;
            break;
        case "ArrowUp":
            nextIndex = (index + items.length - 1) % items.length;
            break;
        case "Home":
            nextIndex = 0;
            break;
        case "End":
            nextIndex = items.length - 1;
            break;
        case "Escape":
            event.preventDefault();
            closeMenu(menu);
            return;
        case "Tab":
            closeMenu(menu);
            return;
        default:
            return;
    }
    event.preventDefault();
    /** @type {HTMLElement} */ (items[nextIndex]).focus();
}

// A resize may switch toolbar modes or invalidate the popover's position.
window.addEventListener("resize", () => {
    for (const menu of document.querySelectorAll(
        ".toolbar-menu:popover-open"
    )) {
        /** @type {HTMLElement} */ (menu).hidePopover();
    }
});
