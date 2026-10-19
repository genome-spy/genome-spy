import { getBuiltInThemeBackground } from "../config/themes.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";

/**
 * Resolves the canvas background configured by the root spec or its selected
 * built-in themes. Later themes override earlier themes when they define a
 * background.
 *
 * @param {import("../spec/root.js").RootSpec} spec
 * @returns {string | import("../spec/parameter.js").ExprRef | undefined}
 */
export function getCanvasBackground(spec) {
    if (spec.background !== undefined) {
        return spec.background;
    }

    const themes = spec.theme
        ? Array.isArray(spec.theme)
            ? spec.theme
            : [spec.theme]
        : [];
    let background;
    for (const themeName of themes) {
        const value = getBuiltInThemeBackground(themeName);
        if (value !== undefined) {
            background = value;
        }
    }
    return background;
}

/**
 * Binds the canvas background in the authored root scope. Live rendering and
 * exports read the same settled value; the view owns the computation's lifetime.
 *
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {import("../view/view.js").default} view
 * @returns {() => string | undefined}
 */
export function createCanvasBackgroundReader(spec, view) {
    const configuredBackground = getCanvasBackground(spec);
    const background = configuredBackground ?? {
        expr: "themeColors.background",
    };
    if (!isExprRef(background)) {
        return () => background;
    }

    const expression = view.paramRuntime.createExpression(background);
    const value = view.paramRuntime.computed(
        "canvas background",
        expression.dependencies,
        () => {
            const color = expression();
            if (color !== null && typeof color !== "string") {
                throw new Error(
                    "Canvas background expressions must return a color string or null."
                );
            }
            return color ?? undefined;
        }
    );
    view.paramRuntime.effect([value], () =>
        view.context.animator.requestRender()
    );
    return () => value.get();
}

/**
 * @param {string | undefined} background
 * @param {{background?: string | null}} options
 * @returns {string | null}
 */
export function getExportBackground(background, options) {
    return options.background !== undefined
        ? options.background
        : (background ?? "white");
}
