import { html } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faDesktop } from "@fortawesome/free-solid-svg-icons";

/** @typedef {"webgl" | "webgpu" | "canvas"} Renderer */

/** @type {{value: Renderer, label: string}[]} */
const renderers = [
    { value: "webgl", label: "WebGL" },
    { value: "webgpu", label: "WebGPU (experimental)" },
    { value: "canvas", label: "Canvas" },
];

/**
 * @param {URL} url
 * @returns {Renderer}
 */
export function getRendererFromUrl(url) {
    const value = url.searchParams.get("renderer");
    return (
        renderers.find((renderer) => renderer.value === value)?.value ?? "webgl"
    );
}

/**
 * @param {Renderer} selected
 * @param {(renderer: Renderer) => void} onChange
 */
export function rendererMenu(selected, onChange) {
    const label = renderers.find(
        (renderer) => renderer.value === selected
    ).label;
    return html`
        <div class="renderer-selector">
            <button
                class="tool-button"
                title=${"Renderer: " + label}
                aria-label=${"Renderer: " + label}
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="renderer-menu"
                popovertarget="renderer-menu"
                @keydown=${(/** @type {KeyboardEvent} */ event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        const button = /** @type {HTMLButtonElement} */ (
                            event.currentTarget
                        );
                        const menu = button.nextElementSibling;
                        if (!menu.matches(":popover-open")) {
                            button.click();
                        }
                    }
                }}
            >
                ${icon(faDesktop).node[0]}
                <span>Renderer ▾</span>
            </button>
            <div
                id="renderer-menu"
                class="renderer-menu"
                popover="auto"
                role="menu"
                aria-label="Renderer"
                @toggle=${(/** @type {Event} */ event) => {
                    const menu = /** @type {HTMLElement} */ (
                        event.currentTarget
                    );
                    menu.previousElementSibling.setAttribute(
                        "aria-expanded",
                        String(menu.matches(":popover-open"))
                    );
                    if (menu.matches(":popover-open")) {
                        positionMenu(menu);
                        const selectedItem = /** @type {HTMLButtonElement} */ (
                            menu.querySelector('button[aria-checked="true"]')
                        );
                        selectedItem.focus();
                    }
                }}
                @keydown=${handleMenuKeydown}
            >
                ${renderers.map(
                    ({ value, label }) => html`
                        <button
                            role="menuitemradio"
                            aria-checked=${selected === value}
                            tabindex="-1"
                            @click=${(/** @type {MouseEvent} */ event) => {
                                const item = /** @type {HTMLElement} */ (
                                    event.currentTarget
                                );
                                closeMenu(item.parentElement);
                                onChange(value);
                            }}
                        >
                            <span class="renderer-check" aria-hidden="true"
                                >${selected === value ? "✓" : ""}</span
                            >
                            ${label}
                        </button>
                    `
                )}
            </div>
        </div>
    `;
}

/** @param {HTMLElement} menu */
function positionMenu(menu) {
    const bounds = menu.previousElementSibling.getBoundingClientRect();
    menu.style.left =
        Math.max(
            4,
            Math.min(bounds.left, window.innerWidth - menu.offsetWidth - 4)
        ) + "px";
    menu.style.top = bounds.bottom + "px";
}

/** @param {HTMLElement} menu */
function closeMenu(menu) {
    menu.hidePopover();
    /** @type {HTMLElement} */ (menu.previousElementSibling).focus();
}

/** @param {KeyboardEvent} event */
function handleMenuKeydown(event) {
    const menu = /** @type {HTMLElement} */ (event.currentTarget);
    const items = Array.from(menu.querySelectorAll("button"));
    const index = items.indexOf(
        /** @type {HTMLButtonElement} */ (document.activeElement)
    );
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
    items[nextIndex].focus();
}
