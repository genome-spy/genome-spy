import { RootConfig } from "./root.js";
import {
    ConcatSpec,
    HConcatSpec,
    ImportSpec,
    LayerSpec,
    UnitSpec,
    VConcatSpec,
} from "./view.js";

interface CoreSchemaViewConfig {
    templates?: Record<string, CoreSchemaViewSpec>;
}

interface CoreSchemaUnitSpec
    extends Omit<UnitSpec, "templates">, CoreSchemaViewConfig {}

interface CoreSchemaLayerSpec
    extends Omit<LayerSpec, "templates" | "layer">, CoreSchemaViewConfig {
    layer: (CoreSchemaLayerSpec | CoreSchemaUnitSpec | ImportSpec)[];
}

interface CoreSchemaVConcatSpec
    extends Omit<VConcatSpec, "templates" | "vconcat">, CoreSchemaViewConfig {
    vconcat: (CoreSchemaViewSpec | ImportSpec)[];
}

interface CoreSchemaHConcatSpec
    extends Omit<HConcatSpec, "templates" | "hconcat">, CoreSchemaViewConfig {
    hconcat: (CoreSchemaViewSpec | ImportSpec)[];
}

interface CoreSchemaConcatSpec
    extends Omit<ConcatSpec, "templates" | "concat">, CoreSchemaViewConfig {
    concat: (CoreSchemaViewSpec | ImportSpec)[];
}

type CoreSchemaViewSpec =
    | CoreSchemaUnitSpec
    | CoreSchemaLayerSpec
    | CoreSchemaVConcatSpec
    | CoreSchemaHConcatSpec
    | CoreSchemaConcatSpec;

export type CoreRootSpec = CoreSchemaViewSpec & RootConfig;
