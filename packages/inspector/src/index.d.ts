export interface InspectorHost {
    getRootView?(): any | undefined;
    getGenomeSpy?(): any | undefined;
    highlightView?(view: object | null): void;
}

export declare class InspectorSession extends EventTarget {
    constructor(host: InspectorHost | { genomeSpy?: any });
    readonly includeChrome: boolean;
    snapshot: any;
    setIncludeChrome(includeChrome: boolean): Promise<void>;
    refresh(): Promise<void>;
    highlightView(viewId: string | undefined): void;
    dispose(): void;
}

export declare function createInspectorPanel(
    host: ConstructorParameters<typeof InspectorSession>[0],
    options?: {
        activePanel?: string;
    }
): Promise<{
    panel: HTMLElement;
    session: InspectorSession;
    dispose(): void;
}>;

export declare function genomeSpyInspector(options?: {
    preferredWidth?: string;
}): any;
