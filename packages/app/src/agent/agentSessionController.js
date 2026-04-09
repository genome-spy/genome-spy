import templateResultToString from "../utils/templateResultToString.js";
import { parseClarificationMessage } from "./clarificationMessage.js";

/** @typedef {import("./types.d.ts").AgentConversationMessage} AgentConversationMessage */
/** @typedef {import("./types.d.ts").IntentProgram} IntentProgram */
/** @typedef {import("./types.d.ts").IntentProgramExecutionResult} IntentProgramExecutionResult */
/** @typedef {import("./types.d.ts").IntentProgramSummaryLine} IntentProgramSummaryLine */
/** @typedef {import("./types.d.ts").IntentProgramValidationResult} IntentProgramValidationResult */
/** @typedef {import("./types.d.ts").PlanResponse | {
 *     type: "clarify";
 *     message: string | import("lit").TemplateResult;
 *     options?: ChatClarificationOption[];
 * }} ChatPlannerResponse */
/**
 * @typedef {{
 *     onDelta?: (delta: string) => void;
 *     onReasoning?: (delta: string) => void;
 *     onHeartbeat?: () => void;
 * }} AgentStreamCallbacks
 *
 * @typedef {{
 *     turnId: number;
 *     status: "working" | "streaming" | "final" | "error";
 *     placeholder: string;
 *     draftText: string;
 *     reasoningText: string;
 *     heartbeatTick: number;
 * }} AgentActiveTurnSnapshot
 */

/**
 * @typedef {{
 *     value: string;
 *     label: string;
 *     description?: string;
 * }} ChatClarificationOption
 *
 * @typedef {{
 *     id: number;
 *     kind: "user" | "assistant" | "clarification" | "plan" | "result" | "error";
 *     text?: string | import("lit").TemplateResult;
 *     lines?: IntentProgramSummaryLine[];
 *     options?: ChatClarificationOption[];
 *     durationMs?: number | null;
 * }} AgentChatMessage
 *
 * @typedef {{
 *     status: "ready" | "preflighting" | "thinking" | "clarification" | "executing" | "unavailable" | "error";
 *     preflightState: "idle" | "running" | "ready" | "failed";
 *     messages: AgentChatMessage[];
 *     pendingRequest: { message: string } | null;
 *     pendingResponsePlaceholder: string;
 *     queuedMessageCount: number;
 *     lastError: string;
 *     lastResponseDurationMs: number | null;
 * }} AgentSessionSnapshot
 *
 * @typedef {{
 *     requestPlan(
 *         message: string,
 *         history?: AgentConversationMessage[],
 *         stream?: AgentStreamCallbacks,
 *         allowStreaming?: boolean
 *     ): Promise<{ response: ChatPlannerResponse; trace: Record<string, any> }>;
 *     validateIntentProgram(program: unknown): IntentProgramValidationResult;
 *     submitIntentProgram(program: IntentProgram): Promise<IntentProgramExecutionResult>;
 *     summarizeExecutionResult(result: IntentProgramExecutionResult): string;
 *     summarizeIntentProgram(program: IntentProgram): IntentProgramSummaryLine[];
 * }} AgentSessionRuntime
 */

const PREFLIGHT_MESSAGE = 'Preflight check: answer with just "I\'m here".';

/**
 * @param {AgentSessionRuntime} runtime
 * @returns {AgentSessionController}
 */
export function createAgentSessionController(runtime) {
    return new AgentSessionController(runtime);
}

/**
 * State controller for the agent chat session.
 */
export class AgentSessionController {
    /**
     * @param {AgentSessionRuntime} runtime
     */
    constructor(runtime) {
        this.#runtime = runtime;

        /** @type {Set<(snapshot: AgentSessionSnapshot) => void>} */
        this.#listeners = new Set();
        /** @type {Set<(snapshot: AgentActiveTurnSnapshot | null) => void>} */
        this.#activeTurnListeners = new Set();
        /**
         * Keep the session state explicit so the panel can render a read-only
         * snapshot and future session commands can be added without changing
         * the UI contract.
         * @type {AgentSessionSnapshot}
         */
        this.#state = {
            status: "ready",
            preflightState: "idle",
            messages: [],
            pendingRequest: null,
            pendingResponsePlaceholder: "",
            queuedMessageCount: 0,
            lastError: "",
            lastResponseDurationMs: null,
        };

        /** @type {Promise<void> | null} */
        this.#preflightPromise = null;
        /** @type {boolean} */
        this.#drainingQueue = false;
        /** @type {number} */
        this.#nextMessageId = 1;
        /** @type {number} */
        this.#nextTurnId = 1;
        /** @type {string[]} */
        this.#queuedMessages = [];
        /** @type {AgentActiveTurnSnapshot | null} */
        this.#activeTurn = null;
    }

    /** @type {AgentSessionRuntime} */
    #runtime;

    /** @type {Set<(snapshot: AgentSessionSnapshot) => void>} */
    #listeners;

    /** @type {Set<(snapshot: AgentActiveTurnSnapshot | null) => void>} */
    #activeTurnListeners;

    /** @type {AgentSessionSnapshot} */
    #state;

    /** @type {Promise<void> | null} */
    #preflightPromise;

    /** @type {boolean} */
    #drainingQueue;

    /** @type {number} */
    #nextMessageId;

    /** @type {number} */
    #nextTurnId;

    /** @type {string[]} */
    #queuedMessages;

    /** @type {AgentActiveTurnSnapshot | null} */
    #activeTurn;

    /**
     * @param {(snapshot: AgentSessionSnapshot) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
        this.#listeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.#listeners.delete(listener);
        };
    }

    /**
     * @param {(snapshot: AgentActiveTurnSnapshot | null) => void} listener
     * @returns {() => void}
     */
    subscribeToActiveTurn(listener) {
        this.#activeTurnListeners.add(listener);
        listener(this.#cloneActiveTurn());
        return () => {
            this.#activeTurnListeners.delete(listener);
        };
    }

    /**
     * @returns {AgentSessionSnapshot}
     */
    getSnapshot() {
        return {
            ...this.#state,
            messages: this.#state.messages.map((message) => ({
                ...message,
                lines: message.lines?.slice(),
                options: message.options?.map((option) => ({
                    ...option,
                })),
            })),
        };
    }

    /**
     * Opens the session and starts the preflight check.
     *
     * @returns {Promise<void>}
     */
    async open() {
        await this.#ensurePreflight();
    }

    /**
     * Closes the session view. The controller keeps the transcript state so
     * the panel can be reattached without losing context.
     */
    close() {}

    /**
     * Forces the preflight to run again.
     *
     * @returns {Promise<void>}
     */
    async refreshPreflight() {
        this.#preflightPromise = null;
        this.#state.preflightState = "idle";
        this.#state.status = "ready";
        this.#notify();
        await this.#ensurePreflight(true);
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async sendMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }

        if (this.#shouldQueue()) {
            await this.queueMessage(trimmed);
            void this.#ensurePreflight();
            return;
        }

        await this.#processMessage(trimmed);
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async queueMessage(message) {
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }

        this.#queuedMessages.push(trimmed);
        this.#state.queuedMessageCount = this.#queuedMessages.length;
        this.#notify();
        void this.#drainQueue();
    }

    /**
     * @returns {boolean}
     */
    #shouldQueue() {
        return (
            this.#state.preflightState !== "ready" ||
            this.#state.pendingRequest !== null
        );
    }

    /**
     * @param {boolean} [force=false]
     * @returns {Promise<void>}
     */
    async #ensurePreflight(force = false) {
        if (this.#preflightPromise) {
            return this.#preflightPromise;
        }

        if (!force && this.#state.preflightState === "ready") {
            return;
        }

        this.#state.preflightState = "running";
        this.#state.status = "preflighting";
        this.#state.lastError = "";
        this.#notify();

        const preflightPromise = this.#runPreflight();
        this.#preflightPromise = preflightPromise;

        try {
            await preflightPromise;
        } finally {
            if (this.#preflightPromise === preflightPromise) {
                this.#preflightPromise = null;
            }
        }
    }

    /**
     * Runs a harmless planner request to prime the server prompt cache and
     * verify the transport path before the first real user turn.
     *
     * @returns {Promise<void>}
     */
    async #runPreflight() {
        try {
            const { response } = await this.#runtime.requestPlan(
                PREFLIGHT_MESSAGE,
                [],
                undefined,
                false
            );

            if (!this.#looksDecent(response)) {
                throw new Error(
                    "Agent preflight returned an invalid response."
                );
            }

            this.#state.preflightState = "ready";
            this.#state.status = "ready";
            this.#notify();
            await this.#drainQueue();
        } catch {
            this.#state.preflightState = "failed";
            this.#state.status = "unavailable";
            this.#state.pendingRequest = null;
            this.#state.pendingResponsePlaceholder = "";
            this.#state.lastError =
                "It seems that the agent is currently unavailable.";
            this.#notify();
        }
    }

    /**
     * @param {ChatPlannerResponse} response
     * @returns {boolean}
     */
    #looksDecent(response) {
        return (
            typeof response === "object" &&
            response !== null &&
            "type" in response &&
            (response.type === "answer" ||
                response.type === "clarify" ||
                response.type === "intent_program" ||
                response.type === "view_workflow" ||
                response.type === "agent_program")
        );
    }

    /**
     * @param {string} message
     * @returns {Promise<void>}
     */
    async #processMessage(message) {
        if (this.#state.pendingRequest) {
            await this.queueMessage(message);
            return;
        }

        this.#appendMessage({
            kind: "user",
            text: message,
        });

        this.#state.pendingRequest = { message };
        this.#state.pendingResponsePlaceholder = "Working...";
        this.#state.status = "thinking";
        this.#state.lastError = "";
        this.#state.lastResponseDurationMs = null;
        this.#notify();

        const turnId = this.#beginActiveTurn();

        try {
            const history = this.#buildHistory();
            const { response, trace } = await this.#runtime.requestPlan(
                message,
                history,
                {
                    onDelta: (delta) => {
                        this.#appendActiveTurnDelta(turnId, delta);
                    },
                    onReasoning: (delta) => {
                        this.#appendActiveTurnReasoning(turnId, delta);
                    },
                    onHeartbeat: () => {
                        this.#touchActiveTurn(turnId);
                    },
                }
            );
            await this.#handleResponse(response, trace.totalMs, turnId);
        } catch (error) {
            this.#state.pendingResponsePlaceholder = "";
            this.#state.status = "error";
            this.#state.lastError = String(error);
            this.#markActiveTurnError(turnId);
            this.#appendMessage({
                kind: "error",
                text: this.#state.lastError,
            });
        } finally {
            this.#state.pendingRequest = null;
            this.#state.pendingResponsePlaceholder = "";
            this.#clearActiveTurn(turnId);
            this.#notify();
            void this.#drainQueue();
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async #drainQueue() {
        if (this.#drainingQueue || this.#state.preflightState !== "ready") {
            return;
        }

        this.#drainingQueue = true;
        try {
            while (
                this.#queuedMessages.length > 0 &&
                this.#state.preflightState === "ready" &&
                !this.#state.pendingRequest
            ) {
                const nextMessage = this.#queuedMessages.shift();
                this.#state.queuedMessageCount = this.#queuedMessages.length;
                this.#notify();
                if (nextMessage) {
                    await this.#processMessage(nextMessage);
                }
                if (
                    this.#state.status === "error" ||
                    this.#state.status === "unavailable"
                ) {
                    break;
                }
            }
        } finally {
            this.#drainingQueue = false;
            this.#notify();
        }
    }

    /**
     * @returns {AgentConversationMessage[]}
     */
    #buildHistory() {
        return this.#state.messages
            .filter(
                (message) =>
                    message.kind === "user" ||
                    message.kind === "assistant" ||
                    message.kind === "clarification" ||
                    message.kind === "plan" ||
                    message.kind === "result"
            )
            .map((message) => {
                const text =
                    typeof message.text === "string"
                        ? message.text
                        : message.text
                          ? templateResultToString(message.text)
                          : "";

                const historyMessage =
                    /** @type {AgentConversationMessage} */ ({
                        id: String(message.id),
                        role: message.kind === "user" ? "user" : "assistant",
                        text,
                    });

                if (message.kind === "clarification") {
                    return /** @type {AgentConversationMessage} */ ({
                        ...historyMessage,
                        kind: "clarification",
                    });
                }

                return historyMessage;
            })
            .filter((message) => message.text.length > 0);
    }

    /**
     * @param {ChatPlannerResponse} response
     * @param {number | undefined} durationMs
     * @param {number} turnId
     * @returns {Promise<void>}
     */
    async #handleResponse(response, durationMs, turnId) {
        this.#clearActiveTurn(turnId);
        this.#state.pendingResponsePlaceholder = "";
        this.#state.lastResponseDurationMs = durationMs ?? null;

        if (response.type === "answer") {
            this.#appendMessage({
                kind: "assistant",
                text: response.message,
                durationMs: durationMs ?? null,
            });
            this.#state.status = "ready";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        if (response.type === "clarify") {
            const parsedClarification = parseClarificationMessage(
                response.message
            );
            const options =
                "options" in response && response.options?.length > 0
                    ? /** @type {ChatClarificationOption[]} */ (
                          response.options
                      )
                    : parsedClarification.options;
            this.#appendMessage({
                kind: "clarification",
                text:
                    options.length > 0
                        ? parsedClarification.text
                        : response.message,
                options: options.map((option) => ({
                    value: option.value,
                    label: option.label,
                    description: option.description,
                })),
                durationMs: durationMs ?? null,
            });
            this.#state.status = "clarification";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        if (response.type === "intent_program") {
            const planLines = this.#runtime.summarizeIntentProgram(
                response.program
            );

            this.#appendMessage({
                kind: "plan",
                text:
                    response.program.rationale ??
                    "The agent proposed an action plan.",
                lines: planLines,
                durationMs: durationMs ?? null,
            });

            this.#state.status = "executing";
            this.#notify();

            const validation = this.#runtime.validateIntentProgram(
                response.program
            );
            if (!validation.ok || !validation.program) {
                const validationMessage = validation.errors.join("\n");
                this.#appendMessage({
                    kind: "error",
                    text: validationMessage,
                });
                this.#state.status = "error";
                this.#state.lastError = validationMessage;
                this.#notify();
                return;
            }

            const result = await this.#runtime.submitIntentProgram(
                validation.program
            );
            this.#appendMessage({
                kind: "result",
                text:
                    "Executed " +
                    result.executedActions +
                    " action" +
                    (result.executedActions === 1 ? "" : "s") +
                    ".",
                lines: result.summaries,
            });
            this.#state.status = "ready";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        if (response.type === "view_workflow") {
            this.#appendMessage({
                kind: "assistant",
                text: "The planner returned a structured view workflow. That path is not wired into the chat panel yet.",
            });
            this.#state.status = "ready";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        if (response.type === "agent_program") {
            this.#appendMessage({
                kind: "assistant",
                text: "The planner returned an agent program. That path is not wired into the chat panel yet.",
            });
            this.#state.status = "ready";
            this.#state.lastError = "";
            this.#notify();
            return;
        }

        const exhaustiveCheck = /** @type {never} */ (response);
        this.#appendMessage({
            kind: "error",
            text: "Unsupported planner response: " + String(exhaustiveCheck),
        });
        this.#state.status = "error";
        this.#state.lastError = "Unsupported planner response.";
        this.#notify();
    }

    /**
     * @returns {number}
     */
    #beginActiveTurn() {
        const turnId = this.#nextTurnId++;
        this.#activeTurn = {
            turnId,
            status: "working",
            placeholder: "Working...",
            draftText: "",
            reasoningText: "",
            heartbeatTick: 0,
        };
        this.#notifyActiveTurn();
        return turnId;
    }

    /**
     * @param {number} turnId
     * @param {string} delta
     */
    #appendActiveTurnDelta(turnId, delta) {
        if (!delta || !this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            status: "streaming",
            draftText: this.#activeTurn.draftText + delta,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     * @param {string} delta
     */
    #appendActiveTurnReasoning(turnId, delta) {
        if (!delta || !this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            reasoningText: this.#activeTurn.reasoningText + delta,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     */
    #touchActiveTurn(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            heartbeatTick: this.#activeTurn.heartbeatTick + 1,
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     */
    #markActiveTurnError(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = {
            ...this.#activeTurn,
            status: "error",
        };
        this.#notifyActiveTurn();
    }

    /**
     * @param {number} turnId
     */
    #clearActiveTurn(turnId) {
        if (!this.#activeTurn || this.#activeTurn.turnId !== turnId) {
            return;
        }

        this.#activeTurn = null;
        this.#notifyActiveTurn();
    }

    /**
     * @returns {AgentActiveTurnSnapshot | null}
     */
    #cloneActiveTurn() {
        if (!this.#activeTurn) {
            return null;
        }

        return {
            ...this.#activeTurn,
        };
    }

    /**
     * Emits the current active-turn snapshot to all listeners.
     */
    #notifyActiveTurn() {
        const snapshot = this.#cloneActiveTurn();
        for (const listener of this.#activeTurnListeners) {
            listener(snapshot);
        }
    }

    /**
     * @param {Omit<AgentChatMessage, "id">} message
     */
    #appendMessage(message) {
        this.#state.messages = [
            ...this.#state.messages,
            {
                id: this.#nextMessageId++,
                ...message,
            },
        ];
    }

    /**
     * Emits the current snapshot to all listeners.
     */
    #notify() {
        const snapshot = this.getSnapshot();
        for (const listener of this.#listeners) {
            listener(snapshot);
        }
    }
}
