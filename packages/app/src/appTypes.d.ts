import { BookmarkEntry } from "./bookmark/databaseSchema.js";
import { EmbedResult } from "@genome-spy/core/types/embedApi.js";

export type UrlHash = Partial<BookmarkEntry>;

export type AppEmbedOptions =
    import("@genome-spy/core/types/embedApi.js").EmbedOptions & {
        showInspectorButton?: boolean;
        showLocalAgentButton?: boolean;
        agentBaseUrl?: string;
        agentAdapterFactory?: (
            app: import("./app.js").default
        ) => import("./agent/types.js").AgentAdapter;
        toolbarMenuItemsFactory?: (
            app: import("./app.js").default
        ) => import("./utils/ui/contextMenu.js").MenuItem[];
    };

export type AppEmbedFunction = (
    el: HTMLElement | string,
    spec: import("./spec/appSpec.js").AppRootSpec | string,
    options?: AppEmbedOptions
) => EmbedResult;

export interface DependencyQueryDetails {
    /** Name of the queried dependency */
    name: string;
    /** Callback that will set the dependency. */
    setter: (dependency: any) => void;
}

export type DependencyQueryEvent = CustomEvent<DependencyQueryDetails>;
