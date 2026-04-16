export interface AgentEmbedOptions {
    agentBaseUrl?: string;
    agentAdapterFactory?: (
        app: import("../app.js").default
    ) => import("./types.js").AgentAdapter;
}
