import { ensureAssembliesForView } from "../genome/assemblyPreflight.js";
import { initializeVisibleViewData } from "../genomeSpy/viewDataInit.js";
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
import { VISIT_SKIP } from "./view.js";
import { isChromeView } from "./viewSelectors.js";
import { isImportSpec } from "./viewSpecGuards.js";
import { cloneWithSpecOrigin } from "../utils/specOrigin.js";
import { finalizeOutputDeclarations } from "./transformOutputDeclarations.js";
import IntervalUrlSource from "../data/sources/lazy/intervalUrlSource.js";

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
     *   syncMutationGuideViews?: (gridChild?: import("./gridView/gridChild.js").default | void) => Promise<ReadonlySet<View>>,
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
            finalizeOutputDeclarations(childView);
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
            await this.initializeMutationViews(guideRoots, childView);
        } catch (error) {
            if (viewInserted) {
                await this.#rollbackInsertedChild(insertIndex, error);
            } else {
                if (specInserted) specs.splice(insertIndex, 1);
                const sources = this.container.context.dataFlow.dataSources;
                childView.disposeSubtree();
                await awaitDisposedSources(sources);
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
        const sources = this.container.context.dataFlow.dataSources;

        try {
            clearViewLevelScaleProps(this.container);
            clearViewLevelGuideProps(this.container);
            this.options.removeView(index);
            this.options.specs.splice(index, 1);
            attachViewLevelScaleProps(this.container);
            attachViewLevelAxisProps(this.container);
            attachViewLevelLegendProps(this.container);

            // Removed children may change shared guide ownership and visibility.
            const guideRoots = await this.options.syncMutationGuideViews?.();

            await this.initializeMutationViews(guideRoots);

            if (options.requestLayout !== false) {
                this.container.invalidateSizeCache();
                this.container.context.requestLayoutReflow();
            }
        } finally {
            await awaitDisposedSources(sources);
        }
    }

    /**
     * Initializes the inserted subtree and generated chrome after a mutation.
     *
     * @param {ReadonlySet<View>} [guideHosts] Layout ancestors that refreshed guides.
     * @param {View} [inserted]
     */
    initializeMutationViews(guideHosts, inserted) {
        const { container } = this;
        if (!inserted && container.getDataInitializationState() === "none") {
            return;
        }

        const root =
            container
                .getLayoutAncestors()
                .findLast((view) => guideHosts?.has(view)) ?? container;
        const viewsToInitialize = new Set(inserted?.getDescendants());

        /** @param {View} view */
        const collectUninitialized = (view) => {
            if (view.getDataInitializationState() === "none") {
                viewsToInitialize.add(view);
            }
        };
        /** @type {import("./view.js").Visitor} */
        const collectChromeSubtree = (view) => {
            if (!isChromeView(view)) return;
            if (view.getDataInitializationState() !== "none") return;

            view.visit(collectUninitialized);
            return VISIT_SKIP;
        };
        root.visit(collectChromeSubtree);

        configureViewsAfterScaleResolution(viewsToInitialize);

        return initializeVisibleViewData(
            root,
            container.context.dataFlow,
            container.context.textMetrics,
            viewsToInitialize
        );
    }
}

/**
 * Await only readers actually pruned by this mutation; shared sources survive.
 * @param {import("../data/sources/dataSource.js").default[]} sources
 */
async function awaitDisposedSources(sources) {
    const results = await Promise.allSettled(
        sources
            .filter(
                (source) =>
                    source.disposed && source instanceof IntervalUrlSource
            )
            .map((source) =>
                /** @type {IntervalUrlSource<any, any>} */ (
                    source
                ).whenDisposed()
            )
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
}
