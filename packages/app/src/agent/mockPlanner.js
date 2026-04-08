/**
 * @typedef {import("./types.d.ts").AgentConversationMessage} AgentConversationMessage
 * @typedef {import("./types.d.ts").AgentContext} AgentContext
 */

/**
 * @param {{
 *     message: string;
 *     history: AgentConversationMessage[];
 *     context: AgentContext;
 * }} request
 * @returns {Promise<{ response: import("./types.d.ts").PlanResponse }>}
 */
export async function requestMockPlan(request) {
    void request.history;

    const lowerMessage = request.message.toLowerCase();

    if (isClarificationRequest(lowerMessage)) {
        return {
            response: {
                type: "clarify",
                message:
                    "Which part should I focus on: the visualization structure, the encodings, or the available attributes?",
            },
        };
    }

    return {
        response: {
            type: "answer",
            message: summarizeMockAnswer(request.context, lowerMessage),
        },
    };
}

/**
 * @param {string} message
 * @returns {boolean}
 */
function isClarificationRequest(message) {
    return message.includes("which") || message.includes("what attribute");
}

/**
 * @param {AgentContext} context
 * @param {string} message
 * @returns {string}
 */
function summarizeMockAnswer(context, message) {
    const root = context.viewRoot;
    const viewTitles = root.children
        .map((child) => child.title)
        .filter(Boolean)
        .slice(0, 4);
    const attributeTitles = context.attributes
        .map((attribute) => attribute.title)
        .filter(Boolean)
        .slice(0, 4);

    if (message.includes("methylation") || message.includes("encode")) {
        const encodingSummary = findMockEncodingSummary(root);

        return (
            encodingSummary ??
            "Methylation levels are encoded in the quantitative beta-value track across genomic positions."
        );
    }

    if (
        message.includes("what") ||
        message.includes("describe") ||
        message.includes("explain")
    ) {
        return (
            root.description +
            " Key visible branches include " +
            viewTitles.join(", ") +
            ". Available attributes include " +
            attributeTitles.join(", ") +
            "."
        );
    }

    return (
        "This visualization summarizes " +
        context.sampleSummary.sampleCount +
        " samples across " +
        context.sampleSummary.groupCount +
        " groups. Visible branches include " +
        viewTitles.join(", ") +
        "."
    );
}

/**
 * @param {AgentContext["viewRoot"]} node
 * @returns {string | null}
 */
function findMockEncodingSummary(node) {
    if (node.name === "beta-values" || node.title === "ENCODE betas") {
        return "Methylation levels are encoded on the ENCODE betas track, where the x channel shows genomic position and the y channel shows beta values.";
    }

    for (const child of node.children ?? []) {
        const summary = findMockEncodingSummary(child);
        if (summary) {
            return summary;
        }
    }

    return null;
}
