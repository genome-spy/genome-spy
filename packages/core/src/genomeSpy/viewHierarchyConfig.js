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
 * Completes view setup after scale/axis resolution has stabilized.
 *
 * Dynamic opacity and transitioned expression params need resolved scales.
 * If we end up with more post-resolve work, consider a post-resolve thunk queue.
 *
 * @param {import("../view/view.js").default} viewRoot
 */
export function finalizeViewConfiguration(viewRoot) {
    configureViewsAfterScaleResolution(viewRoot.getDescendants());
}

/**
 * Completes post-scale setup for views after their scales and guides are configured.
 *
 * @param {Iterable<import("../view/view.js").default>} views
 */
export function configureViewsAfterScaleResolution(views) {
    for (const view of views) {
        view.configurePostScaleParams();
        view.configureViewOpacity();
        view.finalizeParamRuntimeInitialization();
    }
}
