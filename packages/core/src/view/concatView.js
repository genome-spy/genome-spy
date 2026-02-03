import { isConcatSpec, isHConcatSpec, isVConcatSpec } from "./viewFactory.js";
import GridView from "./gridView/gridView.js";
import ContainerMutationHelper from "./containerMutationHelper.js";

/**
 * Creates a vertically or horizontally concatenated layout for children.
 */
export default class ConcatView extends GridView {
    /**
     *
     * @param {import("../spec/view.js").AnyConcatSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     */
    constructor(spec, context, layoutParent, dataParent, name) {
        super(
            spec,
            context,
            layoutParent,
            dataParent,
            name,
            isConcatSpec(spec)
                ? spec.columns
                : isVConcatSpec(spec)
                  ? 1
                  : Infinity
        );

        this.spec = spec;
    }

    /**
     * @override
     */
    async initializeChildren() {
        const spec = this.spec;
        const childSpecs = isConcatSpec(spec)
            ? spec.concat
            : isVConcatSpec(spec)
              ? spec.vconcat
              : spec.hconcat;

        this.setChildren(
            await Promise.all(
                childSpecs.map((childSpec) =>
                    this.context.createOrImportView(
                        childSpec,
                        this,
                        this,
                        this.getNextAutoName("grid")
                    )
                )
            )
        );

        await this.createAxes();
    }

    /**
     * Adds a child spec dynamically. Intended for post-initialization updates.
     *
     * Callers should prefer this over direct GridView insertion to ensure
     * dataflow initialization, axis wiring, and layout reflow are handled.
     *
     * @param {import("../spec/view.js").ViewSpec} childSpec
     * @param {number} [index]
     * @returns {Promise<import("./view.js").default>}
     */
    async addChildSpec(childSpec, index) {
        return this.#getMutationHelper().addChildSpec(childSpec, index);
    }

    /**
     * Removes a child by index. Intended for post-initialization updates.
     *
     * @param {number} index
     */
    async removeChildAt(index) {
        await this.#getMutationHelper().removeChildAt(index);
    }

    /**
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        if (resolutionType == "axis") {
            return "independent";
        }

        // Consider a typical uses case: a view that resembles a genome browser with multiple
        // tracks displaying/ genomic or protein coordinates. In these cases, the default
        // resolution for stacked tracks should be "shared".
        // For others, it should be "independent" to provide better compatibility with Vega-Lite.

        if (
            (isVConcatSpec(this.spec) && channel === "x") ||
            (isHConcatSpec(this.spec) && channel === "y")
        ) {
            return "shared";
        } else {
            return "independent";
        }
    }

    /**
     * @returns {{
     *   specs: (import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec)[],
     *   insertAt: (index: number, spec: import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec) => void,
     *   removeAt: (index: number) => void
     * }}
     */
    #getChildSpecs() {
        const spec = this.spec;
        let specs;

        if (isConcatSpec(spec)) {
            specs = spec.concat;
        } else if (isVConcatSpec(spec)) {
            specs = spec.vconcat;
        } else {
            specs = spec.hconcat;
        }

        return {
            specs,
            insertAt: (index, childSpec) => {
                specs.splice(index, 0, childSpec);
            },
            removeAt: (index) => {
                specs.splice(index, 1);
            },
        };
    }

    /**
     * @returns {ContainerMutationHelper}
     */
    #getMutationHelper() {
        return new ContainerMutationHelper(this, {
            getChildSpecs: this.#getChildSpecs.bind(this),
            insertView: (view, index) => this.insertChildViewAt(view, index),
            removeView: (index) => super.removeChildAt(index),
            prepareView: async (view, _index, gridChild) => {
                await gridChild.createAxes();
                await this.syncSharedAxes();
            },
            afterRemove: async () => {
                await this.syncSharedAxes();
            },
            defaultName: () => this.getNextAutoName("grid"),
        });
    }
}
