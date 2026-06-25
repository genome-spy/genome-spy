import { BookmarkEntry } from "./bookmark/databaseSchema.js";
import { EmbedResult } from "@genome-spy/core/types/embedApi.js";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type UrlHash = Partial<BookmarkEntry>;

export type AppEmbedOptions =
    import("@genome-spy/core/types/embedApi.js").EmbedOptions & {
        plugins?: AppPlugin[];
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
    registerSidePanel?(panel: SidePanelSpec): SidePanelHandle;
}

export interface SidePanelSpec {
    id: string;
    element: HTMLElement;
    preferredWidth?: string;
}

export interface SidePanelHandle {
    show(): void;
    hide(): void;
    toggle(): boolean;
    isVisible(): boolean;
    dispose(): void;
}

export interface AppPluginHost {
    readonly ui: AppUiHost;
    getAgentApi(): Promise<import("./agentApi/index.js").AgentApi>;
}

export interface AppPlugin {
    name?: string;
    install(
        host: AppPluginHost
    ): void | (() => void) | Promise<void | (() => void)>;
}

export interface AppUiRegistry extends AppUiHost, EventTarget {
    readonly toolbarButtons: Set<ToolbarButtonSpec>;
    readonly toolbarMenuItems: Set<
        import("./utils/ui/contextMenu.js").MenuItem
    >;
    attachAppShell(appShell: HTMLElement): void;
    registerSidePanel(panel: SidePanelSpec): SidePanelHandle;
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
