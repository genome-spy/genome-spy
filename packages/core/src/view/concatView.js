import { isConcatSpec, isHConcatSpec, isVConcatSpec } from "./viewFactory";
import GridView from "./gridView";

/**
 * Creates a vertically or horizontally concatenated layout for children.
 */
export default class ConcatView extends GridView {
    /**
     *
     * @param {import("../spec/view").AnyConcatSpec} spec
     * @param {import("../types/viewContext").default} context
     * @param {import("./containerView").default} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(
            spec,
            context,
            parent,
            name,
            isConcatSpec(spec)
                ? spec.columns
                : isVConcatSpec(spec)
                ? 1
                : Infinity
        );

        this.spec = spec;
    }

    _createChildren() {
        const spec = this.spec;
        const childSpecs = isConcatSpec(spec)
            ? spec.concat
            : isVConcatSpec(spec)
            ? spec.vconcat
            : spec.hconcat;

        this.setChildren(
            childSpecs.map((childSpec, i) =>
                // @ts-expect-error TODO: Fix typing
                this.context.createView(childSpec, this, "grid" + i)
            )
        );
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
            const types = new Set(
                this.children
                    .map((child) => child.getEncoding()[channel])
                    .filter((x) => x)
                    .map((e) => "type" in e && e.type)
                    .filter((type) => type)
            );

            return types.size === 1 &&
                (types.has("index") || types.has("locus"))
                ? "shared"
                : "independent";
        } else {
            return "independent";
        }
    }
}
