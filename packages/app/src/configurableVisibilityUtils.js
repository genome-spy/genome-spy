/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("./spec/view.js").AppVisibilityGroupSpec} AppVisibilityGroupSpec
 * @typedef {boolean | AppVisibilityGroupSpec} ConfigurableVisibilitySpec
 */

/**
 * @param {View} view
 * @returns {ConfigurableVisibilitySpec | undefined}
 */
export function getConfigurableVisibility(view) {
    return /** @type {{ configurableVisibility?: ConfigurableVisibilitySpec }} */ (
        view.spec
    ).configurableVisibility;
}

/**
 * @param {View} view
 * @returns {string | undefined}
 */
export function getVisibilityGroup(view) {
    const configurable = getConfigurableVisibility(view);
    if (
        configurable &&
        typeof configurable == "object" &&
        typeof configurable.group == "string" &&
        configurable.group.length
    ) {
        return configurable.group;
    }
}

/**
 * Returns true if view visibility should be configurable in the App.
 *
 * @param {View} view
 * @returns {boolean}
 */
export function isVisibilityConfigurable(view) {
    const explicit = getConfigurableVisibility(view);
    if (explicit !== undefined) {
        return explicit !== false;
    }

    return !(
        view.layoutParent &&
        view.layoutParent.spec &&
        "layer" in view.layoutParent.spec
    );
}

/**
 * Returns true if the spec explicitly enables configurable visibility.
 *
 * @param {View} view
 * @returns {boolean}
 */
export function isExplicitlyVisibilityConfigurable(view) {
    return getConfigurableVisibility(view) !== undefined;
}
