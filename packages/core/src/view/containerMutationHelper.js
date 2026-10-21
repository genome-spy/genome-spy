import { ensureAssembliesForView } from "../genome/assemblyPreflight.js";
import { initializeViewDataForViews } from "../genomeSpy/viewDataInit.js";
import {
    attachViewLevelScaleProps,
    clearViewLevelScaleProps,
} from "../scales/viewLevelScaleProps.js";
import {
    attachViewLevelAxisProps,
    attachViewLevelLegendProps,
    clearViewLevelGuideProps,
} from "../scales/viewLevelGuideProps.js";
import { configureViewsAfterScaleResolution } from "../genomeSpy/viewHierarchyConfig.js";
import { isChromeView } from "./viewSelectors.js";
import { isImportSpec } from "./viewSpecGuards.js";
import { cloneWithSpecOrigin } from "../utils/specOrigin.js";

/**
 * Shared helper for dynamic container mutations.
 * Encapsulates the common lifecycle for adding/removing child views.
 */
export default class ContainerMutationHelper {
    /**
     * @typedef {import("./view.js").default} View
     * @typedef {import("../spec/view.js").ViewSpec} ViewSpec
     * @typedef {import("../spec/view.js").ImportSpec} ImportSpec
     */

    /**
     * @typedef {{
     *   specs: (ViewSpec | ImportSpec)[],
     *   insertView: (view: View, index: number) => import("./gridView/gridChild.js").default | void,
     *   removeView: (index: number) => void,
     *   syncMutationGuideViews?: (gridChild?: import("./gridView/gridChild.js").default | void) => Promise<Iterable<View>>,
     *   namePrefix: string,
     *   createViewOptions?: import("../types/viewContext.js").CreateViewOptions,
     *   specValidator?: (spec: ViewSpec) => void
     * }} MutationOptions
     */

    /**
     * @param {import("./containerView.js").default & { children: View[] }} container
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
        const { specs } = this.options;
        const insertIndex = index ?? specs.length;
        const name = this.container.getNextAutoName(this.options.namePrefix);

        let specInserted = false;
        let viewInserted = false;
        const preparedSpec = this.options.specValidator
            ? cloneWithSpecOrigin(childSpec)
            : childSpec;
        if (!isImportSpec(preparedSpec)) {
            this.options.specValidator?.(preparedSpec);
        }
        const childView = await this.container.context.createOrImportView(
            preparedSpec,
            this.container,
            this.container,
            name,
            this.options.specValidator,
            this.options.createViewOptions
        );

        try {
            specs.splice(insertIndex, 0, childSpec);
            specInserted = true;
            const insertionResult = this.options.insertView(
                childView,
                insertIndex
            );
            viewInserted = true;

            attachViewLevelScaleProps(this.container);
            attachViewLevelAxisProps(this.container);
            attachViewLevelLegendProps(this.container);

            // Reminder: ensure assemblies from the real child hierarchy before any
            // downstream work that may initialize scales (axis prep / encoders).
            await ensureAssembliesForView(
                childView,
                this.container.context.genomeStore
            );

            // Guide views are container-specific. Sync them after configs and
            // assemblies are ready so generated guide marks can initialize.
            const guideRoots =
                await this.options.syncMutationGuideViews?.(insertionResult);
            const viewsToInitialize = new Set(childView.getDescendants());
            for (const root of guideRoots ?? [this.container]) {
                collectUninitializedChromeViews(root, viewsToInitialize);
            }
            configureViewsAfterScaleResolution(viewsToInitialize);

            await initializeViewDataForViews(
                this.container,
                this.container.context.dataFlow,
                this.container.context.textMetrics,
                viewsToInitialize
            );
        } catch (error) {
            if (viewInserted) {
                await this.#rollbackInsertedChild(insertIndex, error);
            } else if (specInserted) {
                specs.splice(insertIndex, 1);
            }

            throw error;
        }

        this.container.invalidateSizeCache();
        this.container.context.requestLayoutReflow();

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
        const child = this.container.children[index];
        if (!child) throw new Error("Child index out of range!");
        child.assertCanDisposeSubtree();
        clearViewLevelScaleProps(this.container);
        clearViewLevelGuideProps(this.container);
        this.options.removeView(index);
        this.options.specs.splice(index, 1);
        attachViewLevelScaleProps(this.container);
        attachViewLevelAxisProps(this.container);
        attachViewLevelLegendProps(this.container);

        // Removed children may change shared guide ownership and visibility.
        const guideRoots = await this.options.syncMutationGuideViews?.();

        await this.initializeUninitializedChromeViews(guideRoots);

        if (options.requestLayout !== false) {
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
     *
     * @param {Iterable<View>} [roots]
     */
    async initializeUninitializedChromeViews(roots = [this.container]) {
        if (this.container.getDataInitializationState() === "none") {
            return;
        }

        const viewsToInitialize = new Set();
        for (const root of roots) {
            collectUninitializedChromeViews(root, viewsToInitialize);
        }
        configureViewsAfterScaleResolution(viewsToInitialize);

        await initializeViewDataForViews(
            this.container,
            this.container.context.dataFlow,
            this.container.context.textMetrics,
            viewsToInitialize
        );
    }
}

/**
 * @param {import("./view.js").default} root
 * @param {Set<import("./view.js").default>} [views]
 * @returns {Set<import("./view.js").default>}
 */
function collectUninitializedChromeViews(root, views = new Set()) {
    for (const view of root.getDescendants()) {
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
