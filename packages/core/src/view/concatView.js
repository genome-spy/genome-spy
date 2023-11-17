import { isConcatSpec, isHConcatSpec, isVConcatSpec } from "./viewFactory.js";
import GridView from "./gridView.js";

/**
 * Creates a vertically or horizontally concatenated layout for children.
 */
export default class ConcatView extends GridView {
    /**
     *
     * @param {import("../spec/view").AnyConcatSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {import("./containerView").default} layoutParent
     * @param {import("./view").default} dataParent
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
                childSpecs.map((childSpec, i) =>
                    this.context.createOrImportView(
                        childSpec,
                        this,
                        this,
                        "grid" + i
                    )
                )
            )
        );

        await this.createAxes();
    }

    /**
     * @param {import("../spec/channel").Channel} channel
     * @param {import("../spec/view").ResolutionTarget} resolutionType
     * @returns {import("../spec/view").ResolutionBehavior}
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
}
