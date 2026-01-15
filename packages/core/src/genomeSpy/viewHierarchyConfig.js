import {
    checkForDuplicateScaleNames,
    setImplicitScaleNames,
} from "../view/viewUtils.js";

/**
 * @param {import("../view/view.js").default} viewRoot
 */
export function configureViewHierarchy(viewRoot) {
    checkForDuplicateScaleNames(viewRoot);
    setImplicitScaleNames(viewRoot);

    // View opacity should be configured after all scales have been resolved.
    // Currently this doesn't work if new views are added dynamically.
    // TODO: Figure out how to handle dynamic view addition/removal nicely.
    viewRoot.getDescendants().forEach((view) => view.configureViewOpacity());
}
