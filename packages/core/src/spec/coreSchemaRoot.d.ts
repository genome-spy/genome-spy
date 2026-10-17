import { RootConfig } from "./root.js";
import {
    ConcatSpec as CoreConcatSpec,
    FacetSpec as CoreFacetSpec,
    HConcatSpec as CoreHConcatSpec,
    ImportSpec,
    LayerSpec as CoreLayerSpec,
    MultiscaleSpec as CoreMultiscaleSpec,
    UnitSpec as CoreUnitSpec,
    VConcatSpec as CoreVConcatSpec,
    SurroundSpec as CoreSurroundSpec,
    SurroundSideSpec as CoreSurroundSideSpec,
} from "./view.js";

interface SchemaViewConfig {
    templates?: Record<string, ViewSpec>;
}

interface UnitSpec extends Omit<CoreUnitSpec, "templates">, SchemaViewConfig {}

interface LayerSpec
    extends Omit<CoreLayerSpec, "templates" | "layer">, SchemaViewConfig {
    layer: (LayerSpec | UnitSpec | MultiscaleSpec | ImportSpec)[];
}

interface MultiscaleSpec
    extends
        Omit<CoreMultiscaleSpec, "templates" | "multiscale">,
        SchemaViewConfig {
    multiscale: (LayerSpec | UnitSpec | MultiscaleSpec | ImportSpec)[];
}

interface VConcatSpec
    extends
        Omit<CoreVConcatSpec, "templates" | "vconcat" | "annotate">,
        SchemaViewConfig {
    vconcat: (ViewSpec | ImportSpec)[];
    annotate?: (UnitSpec | LayerSpec)[];
}

interface HConcatSpec
    extends
        Omit<CoreHConcatSpec, "templates" | "hconcat" | "annotate">,
        SchemaViewConfig {
    hconcat: (ViewSpec | ImportSpec)[];
    annotate?: (UnitSpec | LayerSpec)[];
}

interface ConcatSpec
    extends Omit<CoreConcatSpec, "templates" | "concat">, SchemaViewConfig {
    concat: (ViewSpec | ImportSpec)[];
}

interface FacetSpec
    extends Omit<CoreFacetSpec, "templates" | "spec">, SchemaViewConfig {
    spec: LayerSpec | UnitSpec | ImportSpec;
}

type SurroundPlotSpec = UnitSpec | LayerSpec | MultiscaleSpec | ImportSpec;

interface SurroundSideSpec
    extends
        Omit<CoreSurroundSideSpec, "templates" | "views">,
        SchemaViewConfig {
    /**
     * Plots on this side, ordered top-to-bottom on top/bottom or left-to-right
     * on left/right. Accepts unit plots, layers, multiscale layers, nested
     * surrounds, and imports resolving to these.
     */
    views: (SurroundPlotSpec | SurroundSpec)[];
}

type SurroundSide = (SurroundPlotSpec | SurroundSpec)[] | SurroundSideSpec;

interface SurroundSides {
    /** Plots above the center, stacked top-to-bottom and sharing its x scale. */
    top?: SurroundSide;

    /** Plots to the right, stacked left-to-right and sharing the center's y scale. */
    right?: SurroundSide;

    /** Plots below the center, stacked top-to-bottom and sharing its x scale. */
    bottom?: SurroundSide;

    /** Plots to the left, stacked left-to-right and sharing the center's y scale. */
    left?: SurroundSide;
}

interface SurroundSpec
    extends
        Omit<CoreSurroundSpec, "templates" | "spec" | "surround">,
        SchemaViewConfig {
    /**
     * Central plot. Accepts unit plots, layers, multiscale layers, and imports
     * resolving to these. Its width and height determine the aligned plot size.
     */
    spec: SurroundPlotSpec;

    /**
     * Optional top, right, bottom, and left groups. Each accepts an array of
     * plots or an object with `views` and shared view settings. Top/bottom plots
     * share the center's x scale; left/right plots share its y scale.
     */
    surround: SurroundSides;
}

type ViewSpec =
    | UnitSpec
    | LayerSpec
    | MultiscaleSpec
    | FacetSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec
    | SurroundSpec;

export type CoreRootSpec = ViewSpec & RootConfig;
