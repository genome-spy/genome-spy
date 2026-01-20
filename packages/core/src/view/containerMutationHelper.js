import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";
import { configureViewOpacity } from "../genomeSpy/viewHierarchyConfig.js";
import { finalizeSubtreeGraphics } from "./viewUtils.js";

/**
 * Shared helper for dynamic container mutations.
 * Encapsulates the common lifecycle for adding/removing child views.
 */
export default class ContainerMutationHelper {
    /**
     * @typedef {import("./view.js").default} View
     * @typedef {import("../spec/view.js").ViewSpec} ViewSpec
     * @typedef {import("../spec/view.js").ImportSpec} ImportSpec
     *
     * @typedef {{
     *   specs: (ViewSpec | ImportSpec)[],
     *   insertAt: (index: number, spec: ViewSpec | ImportSpec) => void,
     *   removeAt: (index: number) => void
     * }} ChildSpecs
     */

    /**
     * @typedef {{
     *   getChildSpecs: () => ChildSpecs,
     *   insertView: (view: View, index: number) => any,
     *   removeView: (index: number) => void,
     *   prepareView?: (view: View, index: number, insertionResult: any) => Promise<void>,
     *   afterRemove?: (index: number) => Promise<void>,
     *   defaultName?: (index: number, spec: ViewSpec | ImportSpec) => string,
     *   requestLayout?: boolean
     * }} MutationOptions
     */

    /**
     * @param {import("./containerView.js").default} container
     * @param {MutationOptions} options
     */
    constructor(container, options) {
        this.container = container;
        this.options = options;
    }

    /**
     * Adds a child spec dynamically and initializes its subtree dataflow.
     *
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} childSpec
     * @param {number} [index]
     * @returns {Promise<View>}
     */
    async addChildSpec(childSpec, index) {
        const { specs, insertAt } = this.options.getChildSpecs();
        const insertIndex = index ?? specs.length;
        const name =
            this.options.defaultName?.(insertIndex, childSpec) ??
            "child" + specs.length;

        const childView = await this.container.context.createOrImportView(
            childSpec,
            this.container,
            this.container,
            name
        );

        insertAt(insertIndex, childSpec);
        const insertionResult = this.options.insertView(childView, insertIndex);

        if (this.options.prepareView) {
            await this.options.prepareView(
                childView,
                insertIndex,
                insertionResult
            );
        }

        configureViewOpacity(childView);

        const viewPredicate = (
            /** @type {import("./view.js").default} */ view
        ) => view.isConfiguredVisible();
        const { dataSources, graphicsPromises } = initializeViewSubtree(
            childView,
            this.container.context.dataFlow,
            viewPredicate
        );
        await loadViewSubtreeData(childView, dataSources);
        await finalizeSubtreeGraphics(graphicsPromises);

        if (this.options.requestLayout !== false) {
            this.container.invalidateSizeCache();
            this.container.context.requestLayoutReflow();
        }

        return childView;
    }

    /**
     * Removes a child by index and updates the backing spec list.
     *
     * @param {number} index
     */
    async removeChildAt(index) {
        const { removeAt } = this.options.getChildSpecs();
        this.options.removeView(index);
        removeAt(index);

        if (this.options.afterRemove) {
            await this.options.afterRemove(index);
        }

        if (this.options.requestLayout !== false) {
            this.container.invalidateSizeCache();
            this.container.context.requestLayoutReflow();
        }
    }
}
