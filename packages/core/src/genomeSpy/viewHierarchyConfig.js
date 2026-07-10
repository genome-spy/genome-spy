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
}

/**
 * Configures view opacity after scale/axis resolution has stabilized.
 *
 * NOTE: This is a separate pass because dynamic opacity needs resolved scales.
 * If we end up with more post-resolve work, consider a post-resolve thunk queue.
 *
 * @param {import("../view/view.js").default} viewRoot
 */
export function configureViewOpacity(viewRoot) {
    viewRoot.getDescendants().forEach((view) => view.configureViewOpacity());
}

/**
 * Marks view-owned param runtimes as fully prepared for interactive updates.
 *
 * @param {import("../view/view.js").default} viewRoot
 */
export function finalizeParamRuntimeInitialization(viewRoot) {
    viewRoot
        .getDescendants()
        .forEach((view) => view.finalizeParamRuntimeInitialization());
}
