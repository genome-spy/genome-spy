import { Data } from "./data";
import { Scale } from "./scale";
import { TransformParams } from "./transform";
import { Channel, Encoding, FacetFieldDef, PositionalChannel } from "./channel";
import {
    FillAndStrokeProps,
    MarkConfigAndType,
    MarkType,
    RectProps,
} from "./mark";

export interface SizeDef {
    /** Size in pixels */
    px?: number;

    /** Share of the remaining space */
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
    channel?: PositionalChannel;
    /** Stops expressed as units (base pairs, for example) per pixel. */
    unitsPerPixel: number[];
    /** Opacity values that match the given stops. */
    values: number[];
}

export type ViewOpacityDef = number | DynamicOpacity;

export interface Step {
    step: number;
}

export type Side = "top" | "right" | "bottom" | "left";

export type Paddings = Partial<Record<Side, number>>;

export type PaddingConfig = Paddings | number;

export interface ViewConfig extends RectProps, FillAndStrokeProps {
    // TODO: style?: string | string[];

    // TODO: Move to FillAndStrokeProps or something
    strokeWidth?: number;
}

/**
 * Modes:
 * `"normal"`: the view is visible.
 * `"none"`: the view is removed from the layout and is not rendered.
 */
export type DisplayMode = "normal" | "none"; // TODO: magicLens

export interface ViewDisplay {
    /**
     * The default display mode.
     *
     * **Default:** `"normal"`
     */
    display: DisplayMode;

    /**
     * Is the display mode configurable in the UI.
     *
     * **Default:** `false`
     */
    configurable?: boolean;
}

export interface ViewSpecBase extends ResolveSpec {
    name?: string;

    height?: SizeDef | number | Step | "container";
    width?: SizeDef | number | Step | "container";

    /**
     * Padding in pixels.
     *
     * **Default:* `0`
     */
    padding?: PaddingConfig;

    data?: Data;
    transform?: TransformParams[];
    encoding?: Encoding;
    title?: string;

    /**
     * A description of the view. Multiple lines can be provided as an array.
     */
    description?: string | string[];

    baseUrl?: string;

    /**
     * Opacity of the view and all its children.
     *
     * **Default:* `1.0`
     */
    // TODO: Should be available only in Unit and Layer views.
    opacity?: ViewOpacityDef;

    /**
     * Display mode of the view. Either a boolean or a `ViewDisplay` object
     * that allows for more fine-grained configuration. A `true` indicates a
     * visible view and `false` a hidden that is removed from the layout and
     * not rendered.
     *
     * **Default:** `true`
     */
    // TODO: Detach invisible views from the data flow.
    display?: boolean | ViewDisplay;
}

export interface UnitSpec extends ViewSpecBase, AggregateSamplesSpec {
    view?: ViewConfig;
    mark: MarkType | MarkConfigAndType;
}

export interface AggregateSamplesSpec {
    // TODO: Introduce a type (UnitSpec | LayerSpec) that can ba used in SampleView and here
    aggregateSamples?: (UnitSpec | LayerSpec)[];
}

export interface LayerSpec extends ViewSpecBase, AggregateSamplesSpec {
    view?: ViewConfig;
    layer: (LayerSpec | UnitSpec)[];
}

export interface FacetSpec extends ViewSpecBase {
    facet: FacetFieldDef | FacetMapping;
    spec: LayerSpec | UnitSpec;
    columns?: number;
    spacing?: number;
}

export interface SampleAttributeDef {
    type: string;
    /** Color scale (primary) */
    scale?: Scale;
    barScale?: Scale;
    width?: number;
}

export interface SampleDef {
    data?: Data;
    attributes?: Record<string, SampleAttributeDef>;
}

export interface SampleSpec extends ViewSpecBase {
    samples: SampleDef;
    spec: LayerSpec | UnitSpec;

    stickySummaries?: boolean;
}

export type ResolutionTarget = "scale" | "axis";

/**
 * `"independent"` and `"shared"` behave similarly to Vega-Lite.
 * `"excluded"` behaves like `"shared"`, but is not pulled towards the root.
 */
export type ResolutionBehavior = "independent" | "shared" | "excluded";

export interface ResolveSpec {
    resolve?: Partial<
        Record<
            ResolutionTarget,
            Partial<Record<Channel | "default", ResolutionBehavior>>
        >
    >;
}

export type ContainerSpec = (
    | LayerSpec
    | FacetSpec
    | SampleSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec
    | UnitSpec
) &
    ResolveSpec;

export type ViewSpec =
    | UnitSpec
    | LayerSpec
    | FacetSpec
    | SampleSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec;

export interface ImportConfig {
    name?: string;
    url?: string;
    params?: object;
}

export interface ImportSpec {
    import: ImportConfig;
}

export interface ConcatBase extends ViewSpecBase {
    spacing?: number;
}

export interface VConcatSpec extends ConcatBase {
    vconcat: (ViewSpec | ImportSpec)[];
}

export interface HConcatSpec extends ConcatBase {
    hconcat: (ViewSpec | ImportSpec)[];
}

export interface ConcatSpec extends ConcatBase {
    concat: (ViewSpec | ImportSpec)[];
}
