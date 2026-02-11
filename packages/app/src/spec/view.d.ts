import {
    ConcatSpec as CoreConcatSpec,
    HConcatSpec as CoreHConcatSpec,
    ImportSpec,
    LayerSpec as CoreLayerSpec,
    MultiscaleSpec as CoreMultiscaleSpec,
    UnitSpec as CoreUnitSpec,
    VConcatSpec as CoreVConcatSpec,
} from "@genome-spy/core/spec/view.js";
import { SampleSpec } from "./sampleView.js";

// App has two view unions:
// - AppNestedViewSpec: legal in recursive positions (templates, children)
// - AppViewSpec: root-level union that can additionally include SampleSpec
//
// This prevents nested SampleSpecs while still allowing a SampleSpec under
// app-level concat roots.
export type AggregatingSpec = AppUnitSpec | AppLayerSpec;

export interface AggregateSamplesSpec {
    /**
     * Specifies views that [aggregate](https://genomespy.app/docs/sample-collections/visualizing/#aggregation)
     * multiple samples within the GenomeSpy App.
     */
    aggregateSamples?: AggregatingSpec[];
}

export type AppUnitSpec = Omit<CoreUnitSpec, "aggregateSamples" | "templates"> &
    AggregateSamplesSpec & {
        // Re-thread templates to the app union so nested views can use app-only
        // fields (e.g. aggregateSamples), but still exclude nested SampleSpec.
        templates?: Record<string, AppNestedViewSpec>;
    };

export type AppLayerSpec = Omit<
    CoreLayerSpec,
    "layer" | "aggregateSamples" | "templates"
> &
    AggregateSamplesSpec & {
        templates?: Record<string, AppNestedViewSpec>;

        layer: (AppLayerSpec | AppUnitSpec | AppMultiscaleSpec | ImportSpec)[];
    };

export type AppMultiscaleSpec = Omit<
    CoreMultiscaleSpec,
    "multiscale" | "aggregateSamples" | "templates"
> &
    AggregateSamplesSpec & {
        templates?: Record<string, AppNestedViewSpec>;

        multiscale: (
            | AppLayerSpec
            | AppUnitSpec
            | AppMultiscaleSpec
            | ImportSpec
        )[];
    };

export type AppVConcatSpec = Omit<CoreVConcatSpec, "templates" | "vconcat"> & {
    templates?: Record<string, AppNestedViewSpec>;

    vconcat: (AppViewSpec | ImportSpec)[];
};

export type AppHConcatSpec = Omit<CoreHConcatSpec, "templates" | "hconcat"> & {
    templates?: Record<string, AppNestedViewSpec>;

    hconcat: (AppViewSpec | ImportSpec)[];
};

export type AppConcatSpec = Omit<CoreConcatSpec, "templates" | "concat"> & {
    templates?: Record<string, AppNestedViewSpec>;

    concat: (AppViewSpec | ImportSpec)[];
};

export type AppNestedViewSpec =
    | AppUnitSpec
    | AppLayerSpec
    | AppMultiscaleSpec
    | AppVConcatSpec
    | AppHConcatSpec
    | AppConcatSpec;

// App root may contain SampleSpec, but recursive descendants cannot.
export type AppViewSpec = AppNestedViewSpec | SampleSpec;
