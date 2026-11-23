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

/** @param {Renderer} selected */
export function getRendererLabel(selected) {
    return renderers.find((renderer) => renderer.value === selected).label;
}

/**
 * Renderer choices shared by the desktop selector and compact toolbar menu.
 * @param {Renderer} selected
 * @param {(renderer: Renderer) => void} onChange
 * @returns {import("@genome-spy/ui-components/contextMenu").MenuItem[]}
 */
export function rendererMenuItems(selected, onChange) {
    return renderers.map(({ value, label }) => ({
        type: "radio",
        label,
        checked: selected === value,
        callback: () => onChange(value),
    }));
}
