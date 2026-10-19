import { color as parseColor } from "d3-color";
import {
    DEFAULT_THEME_COLORS,
    isAutomaticDefaultThemeColors,
} from "../config/defaultThemeColors.js";

/**
 * Bridges scoped CSS into the automatic palette, without doing work per frame.
 * Authored palette declarations retain exclusive ownership of their values.
 *
 * @param {HTMLElement} container
 * @param {import("../view/view.js").default} view Authored top-level view.
 * @param {(error: unknown) => void} reportError
 */
export function createDefaultThemeStyle(container, view, reportError) {
    if (
        !isAutomaticDefaultThemeColors(
            view.paramRuntime.paramConfigs.get("defaultThemeColors")
        )
    ) {
        return { refresh() {}, dispose() {} };
    }

    const probe = document.createElement("div");
    probe.className = "gs-theme-colors";
    probe.setAttribute("aria-hidden", "true");
    const roles =
        /** @type {(keyof import("../spec/config.js").DefaultThemeColors)[]} */ (
            Object.keys(DEFAULT_THEME_COLORS)
        );
    const swatches = roles.map((role) => {
        const name = role.replace(
            /[A-Z]/g,
            (letter) => "-" + letter.toLowerCase()
        );
        const swatch = document.createElement("span");
        // Public properties are intentionally not declared locally: ancestor
        // overrides must inherit through to each embed's scoped defaults.
        swatch.style.color = `var(--genome-spy-${name}, var(--_genome-spy-${name}))`;
        probe.appendChild(swatch);
        return swatch;
    });
    container.appendChild(probe);

    function refresh() {
        const scheme = getComputedStyle(container).colorScheme;
        // Respect a host's forced scheme. Unconfigured hosts follow the browser.
        probe.style.colorScheme = scheme === "normal" ? "light dark" : scheme;
        const colors = { ...DEFAULT_THEME_COLORS };
        for (const [index, role] of roles.entries()) {
            const value = getComputedStyle(swatches[index]).color;
            const color = parseColor(value);
            if (!color) {
                throw new Error(
                    `Unsupported CSS color for defaultThemeColors.${role}: ${value}. Use named, hex, RGB, or HSL colors.`
                );
            }
            if (role === "background" && color.opacity === 0) {
                colors.background = null;
            } else {
                colors[role] = color.formatRgb();
            }
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
            reportError(error);
        }
    }

    const preference = matchMedia("(prefers-color-scheme: dark)");
    preference.addEventListener("change", onChange);
    const observer = new MutationObserver(onChange);
    // Observe only host attributes, never rendering descendants or stylesheets.
    for (
        let ancestor = container;
        ancestor;
        ancestor =
            ancestor.parentElement ??
            (ancestor.getRootNode() instanceof ShadowRoot
                ? /** @type {HTMLElement} */ (
                      /** @type {ShadowRoot} */ (ancestor.getRootNode()).host
                  )
                : null)
    ) {
        observer.observe(ancestor, { attributes: true });
    }

    return {
        refresh,
        dispose() {
            observer.disconnect();
            preference.removeEventListener("change", onChange);
            probe.remove();
        },
    };
}
