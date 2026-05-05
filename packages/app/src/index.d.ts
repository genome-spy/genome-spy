import type { AppEmbedFunction } from "./embedTypes.d.ts";

export { GenomeSpy, GenomeSpyApp, icon, html } from "./index.js";
export * from "./agentApi/index.js";
export * from "./agentShared/index.js";
export { BaseDialog, showDialog, showMessageDialog } from "./dialog/index.js";

export declare const embed: AppEmbedFunction;
export type * from "./sampleView/types.d.ts";
export type * from "./sampleView/state/sampleState.d.ts";
export type * from "./sampleView/state/payloadTypes.d.ts";
export type {
    SampleAttributeDef,
    SampleAttributeType,
} from "./spec/sampleView.d.ts";
