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
    extends Omit<CoreVConcatSpec, "templates" | "vconcat">, SchemaViewConfig {
    vconcat: (ViewSpec | ImportSpec)[];
}

interface HConcatSpec
    extends Omit<CoreHConcatSpec, "templates" | "hconcat">, SchemaViewConfig {
    hconcat: (ViewSpec | ImportSpec)[];
}

interface ConcatSpec
    extends Omit<CoreConcatSpec, "templates" | "concat">, SchemaViewConfig {
    concat: (ViewSpec | ImportSpec)[];
}

interface FacetSpec
    extends Omit<CoreFacetSpec, "templates" | "spec">, SchemaViewConfig {
    spec: LayerSpec | UnitSpec | ImportSpec;
}

type ViewSpec =
    | UnitSpec
    | LayerSpec
    | MultiscaleSpec
    | FacetSpec
    | VConcatSpec
    | HConcatSpec
    | ConcatSpec;

export type CoreRootSpec = ViewSpec & RootConfig;
