import { html } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faDesktop } from "@fortawesome/free-solid-svg-icons";
import { toolbarMenu } from "./toolbarMenu.js";

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
    return toolbarMenu({
        id: "renderer-menu",
        label: "Renderer: " + label,
        className: "renderer-selector hide-mobile",
        buttonContent: html`${icon(faDesktop).node[0]}<span>Renderer ▾</span>`,
        items: rendererMenuItems(selected, onChange),
        initialFocusSelector: '[aria-checked="true"]',
    });
}

/**
 * Renderer choices shared by the desktop selector and compact toolbar menu.
 * @param {Renderer} selected
 * @param {(renderer: Renderer) => void} onChange
 */
export function rendererMenuItems(selected, onChange) {
    return html`${renderers.map(
        ({ value, label }) => html`
            <button
                role="menuitemradio"
                aria-checked=${selected === value}
                tabindex="-1"
                @click=${() => onChange(value)}
            >
                <span class="renderer-check" aria-hidden="true"
                    >${selected === value ? "✓" : ""}</span
                >
                ${label}
            </button>
        `
    )}`;
}
