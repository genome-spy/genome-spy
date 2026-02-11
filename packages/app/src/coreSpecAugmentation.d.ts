import { SampleSpec } from "@genome-spy/app/spec/sampleView.js";

// App-specific compile-time augmentation for core spec types.
// This file exists only to make app code type-compatible with core classes
// that are typed against @genome-spy/core/spec/view.js.
//
// Important:
// - This is not runtime behavior; declaration files do not emit JS.
// - Core schema generation is isolated through CoreRootSpec, so these app-only
//   extensions do not leak into @genome-spy/core/dist/schema.json.
declare module "@genome-spy/core/spec/view.js" {
    // App-only property. Required so aggregateSamples is accepted in app code
    // that still references core UnitSpec / LayerSpec types.
    interface UnitSpec {
        aggregateSamples?: (UnitSpec | LayerSpec)[];
    }

    // Same as above for layer specs.
    interface LayerSpec {
        aggregateSamples?: (UnitSpec | LayerSpec)[];
    }

    // Hook declared by core. App attaches SampleSpec here so core ViewSpec /
    // ContainerSpec are widened when app is type-checked.
    // eslint-disable-next-line no-unused-vars
    interface ViewSpecExtensions {
        sample: SampleSpec;
    }
}
