import { EmbedResult } from "@genome-spy/core/types/embedApi.js";
import type {
    ViewApi,
    ViewAddress,
    ViewHandle,
    InsertViewOptions,
} from "@genome-spy/core/types/embedApi.js";
import type { AppViewSpec } from "./spec/view.js";
import type { ImportSpec } from "@genome-spy/core/spec/view.js";

/** View mutations available in GenomeSpy App, including SampleSpec insertion. */
export interface AppViewApi extends Omit<ViewApi, "insert" | "transaction"> {
    insert(
        parent: ViewAddress,
        spec: AppViewSpec | ImportSpec,
        options?: InsertViewOptions
    ): Promise<ViewHandle>;
    transaction<T>(callback: (views: AppViewApi) => T | Promise<T>): Promise<T>;
}

export interface AppEmbedResult extends Omit<EmbedResult, "views"> {
    views: AppViewApi;
}

export type AppEmbedOptions = import("./appTypes.js").AppEmbedOptions;

export type AppEmbedFunction = (
    el: HTMLElement | string,
    spec: import("./spec/appSpec.js").AppRootSpec | string,
    options?: AppEmbedOptions
) => Promise<AppEmbedResult>;
