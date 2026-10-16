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
    Side,
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

interface SurroundSideSpec
    extends
        Omit<CoreSurroundSideSpec, "templates" | "views">,
        SchemaViewConfig {
    views: (ViewSpec | ImportSpec)[];
}

interface SurroundSpec
    extends
        Omit<CoreSurroundSpec, "templates" | "spec" | "surround">,
        SchemaViewConfig {
    spec: ViewSpec | ImportSpec;
    surround: Partial<
        Record<Side, SurroundSideSpec | (ViewSpec | ImportSpec)[]>
    >;
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
