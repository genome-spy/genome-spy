import { color as parseColor } from "d3-color";
import {
    DEFAULT_THEME_COLORS,
    isAutomaticDefaultThemeColors,
} from "../config/defaultThemeColors.js";

/**
 * Bridges scoped CSS into the automatic palette, without doing work per frame.
 * The view owns the probe and listeners.
 * Authored palette declarations retain exclusive ownership of their values.
 *
 * @param {HTMLElement} container
 * @param {import("../view/view.js").default} view Authored top-level view.
 */
export function createDefaultThemeStyle(container, view) {
    if (
        !isAutomaticDefaultThemeColors(
            view.paramRuntime.paramConfigs.get("defaultThemeColors")
        )
    ) {
        return () => {};
    }

    const probe = container.appendChild(document.createElement("div"));
    // Inherit color-scheme: normal stays light; the host opts into dark support.
    probe.className = "gs-theme-colors";
    probe.setAttribute("aria-hidden", "true");
    const roles =
        /** @type {(keyof import("../spec/config.js").DefaultThemeColors)[]} */ (
            Object.keys(DEFAULT_THEME_COLORS)
        );
    // Computed styles are live, so one probe can resolve every role in sequence.
    const style = getComputedStyle(probe);

    function refresh() {
        const colors = { ...DEFAULT_THEME_COLORS };
        for (const role of roles) {
            const name = role.replace(/[A-Z]/g, "-$&").toLowerCase();
            // Public properties stay unset locally so host overrides inherit.
            probe.style.color = `var(--genome-spy-${name}, var(--_genome-spy-${name}))`;
            const value = style.color;
            const color = parseColor(value);
            if (!color) {
                throw new Error(
                    `Unsupported CSS color for defaultThemeColors.${role}: ${value}. Use named, hex, RGB, or HSL colors.`
                );
            }
            colors[role] =
                role === "background" && color.opacity === 0
                    ? null
                    : color.formatRgb();
        }
        const previous = view.paramRuntime.getValue("defaultThemeColors");
        if (roles.some((role) => previous[role] !== colors[role])) {
            view.paramRuntime.setValue("defaultThemeColors", colors);
        }
    }

    function onChange() {
        try {
            refresh();
        } catch (error) {
            view.context.reportError(error);
        }
    }

    const preference = matchMedia("(prefers-color-scheme: dark)");
    preference.addEventListener("change", onChange);
    const observer = new MutationObserver(onChange);
    // Observe only host attributes, never rendering descendants or stylesheets.
    /** @type {Node} */
    let ancestor = container;
    while (ancestor) {
        if (ancestor instanceof Element) {
            observer.observe(ancestor, { attributes: true });
        }
        ancestor =
            ancestor.parentNode ??
            (ancestor instanceof ShadowRoot ? ancestor.host : null);
    }

    view.registerDisposer(() => {
        observer.disconnect();
        preference.removeEventListener("change", onChange);
        probe.remove();
    });

    refresh();
    return refresh;
}
