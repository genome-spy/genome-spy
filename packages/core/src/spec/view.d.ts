import { Data } from "./data.js";
import { TransformParams } from "./transform.js";
import {
    Channel,
    Encoding,
    FacetFieldDef,
    PrimaryPositionalChannel,
} from "./channel.js";
import {
    FillAndStrokeProps,
    MarkProps,
    MarkType,
    RectProps,
    RuleProps,
    ShadowProps,
} from "./mark.js";
import { ExprRef } from "./parameter.js";
import { Title } from "./title.js";
import { Parameter } from "./parameter.js";

export interface SizeDef {
    /**
     * Size in pixels
     */
    px?: number;

    /**
     * Share of the remaining space. See [child
     * sizing](https://genomespy.app/docs/grammar/composition/concat/#child-sizing)
     * for details.
     */
    grow?: number;
}

// TODO: Perhaps this should be in "utils"
export type GeometricDimension = "width" | "height";

export interface FacetMapping {
    column?: FacetFieldDef;
    row?: FacetFieldDef;
}

/**
 * DynamicOpacity specifies a zoom-dependent behavior for view opacity.
 * The opacity is interpolated between the specified stops.
 */
export interface DynamicOpacity {
    /**
     * The positional channel whose scale domain controls the opacity.
     * If omitted, `x` is used when available and `y` is used as a fallback.
     */
    channel?: PrimaryPositionalChannel;

    /**
     * Opacity stops expressed as units (base pairs, for example) per pixel.
     * The values must be positive.
     *
     * Each stop is paired with an opacity in `values` at the same index.
     */
    unitsPerPixel: number[];

    /**
     * Opacity values that match the given `unitsPerPixel` stops.
     *
     * Values outside the stop range are clamped to the nearest stop.
     */
    values: number[];
}

export type ViewOpacityDef = number | DynamicOpacity | ExprRef;

export interface Step {
    step: number;
}

export type Side = "top" | "right" | "bottom" | "left";

export type Paddings = Partial<Record<Side, number>>;

export type PaddingConfig = Paddings | number;

interface CompleteViewBackground extends RectProps, FillAndStrokeProps {
    // TODO: style?: string | string[];

    // TODO: Move to FillAndStrokeProps or something
    strokeWidth?: number;
}

export type ViewBackground = Pick<
    CompleteViewBackground,
    "fill" | "fillOpacity" | "stroke" | "strokeWidth" | "strokeOpacity"
> &
    ShadowProps;

export interface SeparatorProps extends Omit<RuleProps, "type"> {
    type?: "rule";

    /**
     * Whether separators extend into the plot margin (axes/padding) around
     * the grid.
     *
     * __Default value:__ `true`
     */
    includePlotMargin?: boolean;
}

export interface ViewSpecBase extends ResolveSpec {
    /**
     * An explicit name used to address the view. It is recommended to keep
     * names unique among siblings. In the App (where view state is
     * bookmarkable), the name must be unique within its import scope for
     * views with configurable visibility, etc.
     */
    name?: string;

    /**
     * Height of the view. If a number, it is interpreted as pixels.
     * Check [child sizing](https://genomespy.app/docs/grammar/composition/concat/#child-sizing)
     * for details.
     *
     * **Default value:** `"container"`
     */
    height?: SizeDef | number | Step | "container";

    /**
     * Width of the view. If a number, it is interpreted as pixels.
     * Check [child sizing](https://genomespy.app/docs/grammar/composition/concat/#child-sizing)
     * for details.
     *
     * **Default:** `"container"`
     */
    width?: SizeDef | number | Step | "container";

    /**
     * Optional viewport height of the view. If the view size exceeds the viewport height,
     * it will be shown with [scrollbars](https://genomespy.app/docs/grammar/composition/concat/#scrollable-viewports).
     * This property implicitly enables clipping.
     *
     * **Default:** `null` (same as `height`)
     */
    viewportHeight?: SizeDef | number | "container";

    /**
     * Optional viewport width of the view. If the view size exceeds the viewport width,
     * it will be shown with [scrollbars](https://genomespy.app/docs/grammar/composition/concat/#scrollable-viewports).
     * This property implicitly enables clipping.
     *
     * **Default:** `null` (same as `width`)
     */
    viewportWidth?: SizeDef | number | "container";

    /**
     * Padding applied to the view. Accepts either a number representing pixels or an
     * object specifying separate paddings for each edge.
     *
     * Examples:
     * - `padding: 10`
     * - `padding: { top: 10, right: 20, bottom: 10, left: 20 }`
     *
     * **Default value:** `0`
     */
    padding?: PaddingConfig;

    /**
     * Dynamic variables that [parameterize](https://genomespy.app/docs/grammar/parameters/)
     * a visualization.
     */
    params?: Parameter[];

    /**
     * Specifies a [data source](https://genomespy.app/docs/grammar/data/).
     * If omitted, the data source is inherited from the parent view.
     */
    data?: Data;

    /**
     * An array of [transformations](https://genomespy.app/docs/grammar/transform/)
     * applied to the data before visual encoding.
     */
    transform?: TransformParams[];

    /**
     * Specifies how data are [encoded](https://genomespy.app/docs/grammar/mark/#encoding)
     * using the visual channels.
     */
    encoding?: Encoding;

    /**
     * If true, this view and its descendants do not contribute to scale domains.
     * Child views inherit this flag automatically.
     *
     * **Default value:** `false`
     *
     * @internal
     */
    domainInert?: boolean;

    /**
     * View title.
     * N.B.: Currently, GenomeSpy doesn't do bound calculation, and you need to
     * manually specify proper padding for the view to ensure that the title is
     * visible.
     */
    title?: string | Title;

    /**
     * A description of the view. Can be used for documentation. The description
     * of the top-level view is shown in the toolbar of the [GenomeSpy
     * App](https://genomespy.app/docs/sample-collections/).
     */
    description?: string | string[];

    /**
     * The base URL for relative URL data sources and URL
     * [imports](https://genomespy.app/docs/grammar/import/#importing-from-a-url).
     * The base URLs are inherited in the view hierarchy unless overridden with
     * this property. By default, the top-level view's base URL equals to the
     * visualization specification's base URL.
     */
    baseUrl?: string;

    /**
     * The default visibility of the view. An invisible view is removed from the
     * layout and not rendered. For context, see [toggleable view
     * visibility](https://genomespy.app/docs/sample-collections/visualizing/#toggleable-view-visibility).
     *
     * **Default:** `true`
     */
    visible?: boolean;

    /**
     * Is the visibility configurable interactively from the [GenomeSpy
     * App](https://genomespy.app/docs/sample-collections/).
     * Configurability requires that the view has an explicitly specified name
     * that is unique within its import scope.
     *
     * **Default:** `false` for children of `layer`, `true` for others.
     */
    configurableVisibility?: boolean;

    /**
     * [Templates](https://genomespy.app/docs/grammar/import/#repeating-with-named-templates)
     * that can be reused within the view specification by importing them with the template key.
     */
    templates?: Record<string, ViewSpec>;
}

export interface DynamicOpacitySpec {
    /**
     * Opacity of the view and all its children.
     *
     * This can be:
     *
     * - a fixed number between `0` and `1`
     * - an expression reference (`ExprRef`)
     * - a `DynamicOpacity` definition for zoom-dependent opacity
     *
     * Dynamic opacity is useful for semantic zooming where layers are faded in
     * and out as the user zooms.
     *
     * Example:
     *
     * ```json
     * "opacity": {
     *   "unitsPerPixel": [100000, 40000],
     *   "values": [0, 1]
     * }
     * ```
     *
     * In this example, the view fades in while zooming in from 100 000 to
     * 40 000 units per pixel.
     *
     * __Default value:__ `1.0`
     */
    opacity?: ViewOpacityDef;
}

export interface UnitSpec extends ViewSpecBase, DynamicOpacitySpec {
    /**
     * The background of the view, including fill, stroke, and stroke width.
     */
    view?: ViewBackground;

    /**
     * The graphical mark presenting the data objects.
     */
    mark: MarkType | MarkProps;
}

export interface LayerSpec extends ViewSpecBase, DynamicOpacitySpec {
    view?: ViewBackground;
    layer: (LayerSpec | UnitSpec | ImportSpec)[];
}

export interface FacetSpec extends ViewSpecBase {
    facet: any; //FacetMapping | FacetFieldDef
    spec: LayerSpec | UnitSpec;
    columns?: number;
    spacing?: number;
}

export type ResolutionTarget = "scale" | "axis";

/**
 * `"independent"` and `"shared"` behave similarly to Vega-Lite.
 * `"excluded"` behaves like `"shared"`, but is not pulled towards the root.
 * `"forced"` behaves like `"shared"`, but is forced towards the root even
 * if the parent has `"independent"` behavior.
 */
export type ResolutionBehavior =
    | "independent"
    | "shared"
    | "excluded"
    | "forced";

export interface ResolveSpec {
    /**
     * Specifies how scales and axes are
     * [resolved](https://genomespy.app/docs/grammar/composition/#scale-and-axis-resolution)
     * in the view hierarchy.
     */
    resolve?: Partial<
        Record<
            ResolutionTarget,
            Partial<Record<Channel | "default", ResolutionBehavior>>
        >
    >;
}

export interface ViewSpecExtensions {}

export type ViewSpecExtension = ViewSpecExtensions[keyof ViewSpecExtensions];

export type CoreViewSpec =
    | UnitSpec
    | LayerSpec
    //    | FacetSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec;

export type ContainerSpec = (CoreViewSpec | ViewSpecExtension) & ResolveSpec;

export type ViewSpec = CoreViewSpec | ViewSpecExtension;

export interface UrlImport {
    /**
     * Imports a specification from the specified URL.
     */
    url: string;
}

export interface TemplateImport {
    /**
     * Imports a specification from the current view hierarchy, searching
     * first in the current view, then ascending through ancestors.
     */
    template: string;
}

export interface ImportSpec {
    /**
     * The name given to the imported view. This property overrides the name
     * specified in the imported specification and defines an import scope that
     * is used for bookmarkable view visibility and parameter addressing.
     */
    name?: string;

    /**
     * Dynamic variables that parameterize a visualization. Parameters defined
     * here override the parameters defined in the imported specification.
     */
    params?: Parameter[] | Record<string, any>;

    /**
     * Overrides the visibility of the imported view.
     *
     * If not specified, the imported specification's `visible` property is used.
     */
    visible?: boolean;

    /**
     * The method to import a specification.
     */
    import: UrlImport | TemplateImport;
}

export interface ConcatBase extends ViewSpecBase {
    /**
     * The gap between the views, in pixels.
     */
    spacing?: number;

    /**
     * Draws separator rules between visible child views. The separators are
     * centered within the spacing gaps and do not affect layout.
     *
     * If `true`, the defaults are equivalent to:
     * `{"type":"rule","size":1,"color":"#ccc","opacity":1,"strokeDash":[4,4],"strokeCap":"butt"}`
     * Use `includePlotMargin` to control whether the separators extend into the
     * plot margin.
     *
     * __Default value:__ `false`
     */
    separator?: boolean | SeparatorProps;
}

export interface VConcatSpec extends ConcatBase {
    /**
     * Specifies views that will be concatenated vertically.
     */
    vconcat: (ViewSpec | ImportSpec)[];
}

export interface HConcatSpec extends ConcatBase {
    /**
     * Specifies views that will be concatenated horizontally.
     */
    hconcat: (ViewSpec | ImportSpec)[];
}

export interface ConcatSpec extends ConcatBase {
    /**
     * Specifies views that will be concatenated into a grid that wraps when
     * the specified number of columns are used.
     */
    concat: (ViewSpec | ImportSpec)[];

    /**
     * The number of columns in the grid.
     */
    columns: number;
}

export type AnyConcatSpec = VConcatSpec | HConcatSpec | ConcatSpec;
