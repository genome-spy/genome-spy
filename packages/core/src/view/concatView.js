import { isConcatSpec, isVConcatSpec } from "./viewFactory";
import GridView from "./gridView";

/**
 * Creates a vertically or horizontally concatenated layout for children.
 */
export default class ConcatView extends GridView {
    /**
     *
     * @param {import("./viewUtils").AnyConcatSpec} spec
     * @param {import("./viewUtils").ViewContext} context
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
        this.children = childSpecs.map((childSpec, i) =>
            this.context.createView(childSpec, this, "grid" + i)
        );
    }
}
