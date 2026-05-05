import { EmbedResult } from "@genome-spy/core/types/embedApi.js";

export type AppEmbedOptions = import("./appTypes.js").AppEmbedOptions;

export type AppEmbedFunction = (
    el: HTMLElement | string,
    spec: import("./spec/appSpec.js").AppRootSpec | string,
    options?: AppEmbedOptions
) => EmbedResult;
