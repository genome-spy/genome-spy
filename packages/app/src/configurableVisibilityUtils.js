/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 */

/**
 * @param {View} view
 * @returns {boolean | undefined}
 */
function getConfigurableVisibility(view) {
    return /** @type {{ configurableVisibility?: boolean }} */ (view.spec)
        .configurableVisibility;
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
        return explicit;
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
    return getConfigurableVisibility(view) === true;
}
