import { BookmarkEntry } from "./bookmark/databaseSchema.js";
import { EmbedResult } from "@genome-spy/core/types/embedApi.js";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type UrlHash = Partial<BookmarkEntry>;

export type AppEmbedOptions =
    import("@genome-spy/core/types/embedApi.js").EmbedOptions & {
        showInspectorButton?: boolean;
    };

export interface ToolbarButtonSpec {
    title: string;
    icon: IconDefinition;
    onClick: () => void | Promise<void>;
}

export interface AppUiHost {
    registerToolbarButton(button: ToolbarButtonSpec): () => void;
    registerToolbarMenuItem(
        item: import("./utils/ui/contextMenu.js").MenuItem
    ): () => void;
}

export interface AppUiRegistry extends AppUiHost, EventTarget {
    readonly toolbarButtons: Set<ToolbarButtonSpec>;
    readonly toolbarMenuItems: Set<
        import("./utils/ui/contextMenu.js").MenuItem
    >;
}

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
