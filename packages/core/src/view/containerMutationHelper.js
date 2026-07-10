import { ensureAssembliesForView } from "../genome/assemblyPreflight.js";
import { initializeViewDataForViews } from "../genomeSpy/viewDataInit.js";
import {
    attachViewLevelScaleConfigs,
    clearViewLevelScaleConfigs,
} from "../scales/viewLevelScaleConfig.js";
import {
    attachViewLevelAxisConfigs,
    attachViewLevelLegendConfigs,
    clearViewLevelGuideConfigs,
} from "../scales/viewLevelGuideConfig.js";
import { isChromeView } from "./viewSelectors.js";

/**
 * @param {unknown} value
 * @returns {value is { getChildren: () => Iterable<import("./view.js").default> }}
 */
function hasGridChildChildren(value) {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (/** @type {any} */ (value).getChildren) === "function"
    );
}

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
     *   syncMutationGuideViews?: (
     *     view: View | undefined,
     *     index: number | undefined,
     *     insertionResult: any
     *   ) => Promise<void>,
     *   defaultName?: (index: number, spec: ViewSpec | ImportSpec) => string,
     *   createViewOptions?: import("../types/viewContext.js").CreateViewOptions,
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
        const { specs, insertAt, removeAt } = this.options.getChildSpecs();
        const insertIndex = index ?? specs.length;
        const name =
            this.options.defaultName?.(insertIndex, childSpec) ??
            this.container.getNextAutoName("child");

        let specInserted = false;
        let viewInserted = false;
        const childView = await this.container.context.createOrImportView(
            childSpec,
            this.container,
            this.container,
            name,
            undefined,
            this.options.createViewOptions
        );

        try {
            insertAt(insertIndex, childSpec);
            specInserted = true;
            const insertionResult = this.options.insertView(
                childView,
                insertIndex
            );
            viewInserted = true;

            attachViewLevelScaleConfigs(this.container);
            attachViewLevelAxisConfigs(this.container);
            attachViewLevelLegendConfigs(this.container);

            // Reminder: ensure assemblies from the real child hierarchy before any
            // downstream work that may initialize scales (axis prep / encoders).
            await ensureAssembliesForView(
                childView,
                this.container.context.genomeStore
            );

            if (this.options.prepareView) {
                await this.options.prepareView(
                    childView,
                    insertIndex,
                    insertionResult
                );
            }

            // Guide views are container-specific. Sync them after configs and
            // assemblies are ready so generated guide marks can initialize.
            if (this.options.syncMutationGuideViews) {
                await this.options.syncMutationGuideViews(
                    childView,
                    insertIndex,
                    insertionResult
                );
            }

            const viewsToInitialize = collectMutationInitializedViews(
                this.container,
                childView,
                insertionResult
            );
            for (const view of viewsToInitialize) {
                view.configureViewOpacity();
                view.finalizeParamRuntimeInitialization();
            }

            await initializeViewDataForViews(
                this.container,
                this.container.context.dataFlow,
                this.container.context.fontManager,
                viewsToInitialize
            );
        } catch (error) {
            if (viewInserted) {
                await this.#rollbackInsertedChild(insertIndex, error);
            } else if (specInserted) {
                removeAt(insertIndex);
            }

            throw error;
        }

        if (this.options.requestLayout !== false) {
            this.container.invalidateSizeCache();
            this.container.context.requestLayoutReflow();
        }

        return childView;
    }

    /**
     * @param {number} index
     * @param {unknown} originalError
     */
    async #rollbackInsertedChild(index, originalError) {
        try {
            await this.removeChildAt(index, { requestLayout: false });
        } catch (rollbackError) {
            /** @type {any} */ (originalError).rollbackError = rollbackError;
        }
    }

    /**
     * Removes a child by index and updates the backing spec list.
     *
     * @param {number} index
     * @param {{ requestLayout?: boolean }} [options]
     */
    async removeChildAt(index, options = {}) {
        const { removeAt } = this.options.getChildSpecs();
        clearViewLevelScaleConfigs(this.container);
        clearViewLevelGuideConfigs(this.container);
        this.options.removeView(index);
        removeAt(index);

        if (this.options.afterRemove) {
            await this.options.afterRemove(index);
        }
        attachViewLevelScaleConfigs(this.container);
        attachViewLevelAxisConfigs(this.container);
        attachViewLevelLegendConfigs(this.container);

        // Removed children may change shared guide ownership and visibility.
        if (this.options.syncMutationGuideViews) {
            await this.options.syncMutationGuideViews(
                undefined,
                undefined,
                undefined
            );
        }

        await this.initializeUninitializedChromeViews();

        if (
            this.options.requestLayout !== false &&
            options.requestLayout !== false
        ) {
            this.container.invalidateSizeCache();
            this.container.context.requestLayoutReflow();
        }
    }

    /**
     * Initializes generated guide/chrome views created by a dynamic mutation.
     *
     * Reorder operations can recreate shared axes or legends without touching
     * normal child dataflow. This keeps those regenerated chrome views renderable
     * without reloading or rebuilding existing track data.
     */
    async initializeUninitializedChromeViews() {
        if (this.container.getDataInitializationState() === "none") {
            return;
        }

        const viewsToInitialize = collectUninitializedChromeViews(
            this.container
        );
        for (const view of viewsToInitialize) {
            view.configureViewOpacity();
            view.finalizeParamRuntimeInitialization();
        }

        await initializeViewDataForViews(
            this.container,
            this.container.context.dataFlow,
            this.container.context.fontManager,
            viewsToInitialize
        );
    }
}

/**
 * @param {import("./containerView.js").default} container
 * @param {import("./view.js").default} childView
 * @param {unknown} insertionResult
 * @returns {Set<import("./view.js").default>}
 */
function collectMutationInitializedViews(
    container,
    childView,
    insertionResult
) {
    const views = collectInsertedViews(childView, insertionResult);
    collectUninitializedChromeViews(container, views);

    return views;
}

/**
 * @param {import("./containerView.js").default} container
 * @param {Set<import("./view.js").default>} [views]
 * @returns {Set<import("./view.js").default>}
 */
function collectUninitializedChromeViews(container, views = new Set()) {
    for (const view of container.getDescendants()) {
        if (
            isChromeView(view) &&
            view.getDataInitializationState() === "none"
        ) {
            for (const chromeView of view.getDescendants()) {
                if (chromeView.getDataInitializationState() === "none") {
                    views.add(chromeView);
                }
            }
        }
    }

    return views;
}

/**
 * @param {import("./view.js").default} childView
 * @param {unknown} insertionResult
 * @returns {Set<import("./view.js").default>}
 */
function collectInsertedViews(childView, insertionResult) {
    if (hasGridChildChildren(insertionResult)) {
        return new Set(
            Array.from(insertionResult.getChildren()).flatMap((view) =>
                view.getDescendants()
            )
        );
    }

    return new Set(childView.getDescendants());
}
