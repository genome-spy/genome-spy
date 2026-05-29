export const MISSING_SAMPLE_ATTRIBUTE_MESSAGE =
    "One or more requested sample attributes are not loaded in the current view. " +
    "Use exact loaded attribute specifiers from context or prior tool results. " +
    "If the current context contains matching metadataSources, import the needed identifiers first with addMetadataFromSource, then use the returned sample attributes. " +
    "If no suitable metadata source exists, the attributes are unavailable.";

const UNRESOLVED_SAMPLE_ATTRIBUTE_MESSAGES = new Set([
    "Could not resolve the requested sample attribute.",
    "Could not resolve one of the requested sample attributes.",
]);

// TODO(app-agent): Replace this string matching with a structured AgentApi
// error code if more recoverable App API failures need agent-specific guidance.

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatAgentToolErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    return UNRESOLVED_SAMPLE_ATTRIBUTE_MESSAGES.has(message)
        ? MISSING_SAMPLE_ATTRIBUTE_MESSAGE
        : message;
}
