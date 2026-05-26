// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const benchmarkDir = path.resolve(scriptDir);
const repoRoot = path.resolve(benchmarkDir, "..", "..", "..");
const appDir = path.join(repoRoot, "packages", "app");

const defaultCaseFile = path.join(benchmarkDir, "cases", "fuse-encode.json");
const defaultAppUrl = "http://127.0.0.1:8080";
const defaultAgentUrl = "http://127.0.0.1:8000";
const defaultTimeoutMs = 90_000;
const defaultCaseDelayMs = 1_000;
const defaultPreflightRetryDelayMs = 1_000;
const defaultRepeats = 1;
const defaultTurnMode = "one-shot";
const defaultMaxFollowups = 1;
const defaultAutoContinueText = "Continue with the most likely next step.";
const defaultModelName = process.env.GENOMESPY_AGENT_MODEL ?? "unknown";
const HELPER_TOOL_NAMES = new Set([
    "getIntentActionDocs",
    "getIntentActionTypeDocs",
]);

const helpText = `Usage:
  node packages/app-agent/benchmarks/run.mjs [options]

Options:
  --case-file PATH     Benchmark case file. Default: packages/app-agent/benchmarks/cases/fuse-encode.json
  --case-id ID         Run only one case id from the case file.
  --case-mode MODE     all, action, or description. Default: all
  --app-url URL        Use an already running app dev server.
  --agent-url URL      Agent server URL. Default: http://127.0.0.1:8000
  --output-dir PATH    Directory for result artifacts.
  --interactive        Run headed and keep the browser open after execution.
  --screenshots        Capture before.png and after.png for each case.
  --quiet-browser-warnings
                       Suppress browser console warnings in CLI output.
  --timeout-ms NUMBER  Per-case timeout in milliseconds. Default: 90000
  --case-delay-ms NUMBER
                       Delay between cases in milliseconds. Default: 1000
  --preflight-retry-delay-ms NUMBER
                       Delay before retrying failed preflight. Default: 1000
  --repeats NUMBER     Run each selected case this many times. Default: 1
  --turn-mode MODE     one-shot or continuable. Default: one-shot
  --auto-continue-text TEXT
                       Follow-up text used in continuable mode.
  --max-followups NUMBER
                       Max automatic continuation turns per case. Default: 1
  --help               Show this help text.

Notes:
  - If --app-url is omitted, this script starts packages/app/dev-server.mjs.
  - The spawned app dev server is configured with VITE_AGENT_BASE_URL=<agent-url>.
  - This runner reuses the real browser agent runtime through the existing
    AgentSessionController instead of implementing benchmark-only agent logic.
`;

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(helpText);
        return;
    }

    const suite = loadCaseFile(options.caseFile);
    const cases = selectCases(suite, options.caseId, options.caseMode);
    if (!cases.length) {
        throw new Error("No benchmark cases selected.");
    }

    const outputDir =
        options.outputDir ??
        path.join(
            benchmarkDir,
            "results",
            createTimestamp().replaceAll(":", "-")
        );
    fs.mkdirSync(outputDir, { recursive: true });

    const playwright = await loadPlaywright();
    const appServer =
        options.appUrl === undefined
            ? await startAppServer(options.agentUrl)
            : undefined;
    const appUrl = options.appUrl ?? defaultAppUrl;
    const agentModuleBaseUrl = new URL(
        "/@fs" + path.join(repoRoot, "packages", "app-agent", "src") + "/",
        appUrl
    ).toString();

    try {
        await waitForHttpOk(appUrl, appServer);

        const browser = await playwright.chromium.launch({
            headless: !options.interactive,
            args: [
                "--use-angle=swiftshader",
                "--use-gl=angle",
                "--enable-webgl",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
            ],
        });

        try {
            const page = await browser.newPage();
            await installPageGuards(page);
            wirePageLogging(page, options);

            /** @type {any[]} */
            const results = [];
            for (const benchmarkCase of cases) {
                /** @type {any[]} */
                const caseResults = [];
                for (
                    let repeatIndex = 0;
                    repeatIndex < options.repeats;
                    repeatIndex += 1
                ) {
                    const repeatLabel =
                        options.repeats > 1
                            ? ` [run ${repeatIndex + 1}/${options.repeats}]`
                            : "";
                    console.log(`Running ${benchmarkCase.id}${repeatLabel}`);
                    const result = await runCase(page, appUrl, benchmarkCase, {
                        defaultSetup: suite.setup ?? {},
                        outputDir,
                        timeoutMs: options.timeoutMs,
                        interactive: options.interactive,
                        screenshots: options.screenshots,
                        agentModuleBaseUrl,
                        preflightRetryDelayMs: options.preflightRetryDelayMs,
                        repeats: options.repeats,
                        repeatIndex,
                        turnMode: options.turnMode,
                        autoContinueText: options.autoContinueText,
                        maxFollowups: options.maxFollowups,
                        modelName: options.modelName,
                    });
                    results.push(result);
                    caseResults.push(result);
                    printCaseResult(result);
                    if (
                        options.caseDelayMs > 0 &&
                        (repeatIndex !== options.repeats - 1 ||
                            benchmarkCase !== cases.at(-1))
                    ) {
                        await wait(options.caseDelayMs);
                    }
                }

                if (options.repeats > 1) {
                    writeCaseAggregateArtifacts(
                        path.join(
                            outputDir,
                            benchmarkCase.id.replaceAll("/", "_")
                        ),
                        caseResults
                    );
                }
            }

            const suiteResult = summarizeSuite(results);
            const suiteOutputPath = path.join(outputDir, "suite-result.json");
            fs.writeFileSync(
                suiteOutputPath,
                JSON.stringify(
                    {
                        suite: suite.visualizationId ?? path.basename(options.caseFile),
                        caseFile: path.relative(repoRoot, options.caseFile),
                        model: options.modelName,
                        generatedAt: new Date().toISOString(),
                        results,
                        summary: suiteResult,
                    },
                    null,
                    2
                )
            );

            console.log(`Wrote ${path.relative(repoRoot, suiteOutputPath)}`);
            const suiteSummaryPath = path.join(outputDir, "suite-summary.md");
            fs.writeFileSync(
                suiteSummaryPath,
                renderSuiteSummaryMarkdown(
                    suite,
                    options,
                    results,
                    suiteResult
                )
            );
            console.log(`Wrote ${path.relative(repoRoot, suiteSummaryPath)}`);
            printSuiteSummary(suiteResult);

            if (options.interactive) {
                console.log(
                    "Interactive mode: press Enter to close the browser."
                );
                await waitForEnter();
            }
        } finally {
            await browser.close();
        }
    } finally {
        await stopServer(appServer);
    }
}

/**
 * @param {import("playwright").Page} page
 * @param {string} appUrl
 * @param {any} benchmarkCase
 * @param {{
 *     defaultSetup: any;
 *     outputDir: string;
 *     timeoutMs: number;
 *     interactive: boolean;
 *     screenshots: boolean;
 *     agentModuleBaseUrl: string;
 *     preflightRetryDelayMs: number;
 *     repeats: number;
 *     repeatIndex: number;
 *     turnMode: "one-shot" | "continuable";
 *     autoContinueText: string;
 *     maxFollowups: number;
 *     modelName: string;
 * }} options
 */
async function runCase(page, appUrl, benchmarkCase, options) {
    const startedAt = Date.now();
    const caseRootDir = path.join(
        options.outputDir,
        benchmarkCase.id.replaceAll("/", "_")
    );
    const caseDir =
        options.repeats > 1
            ? path.join(
                  caseRootDir,
                  "run-" + String(options.repeatIndex + 1).padStart(3, "0")
              )
            : caseRootDir;
    fs.mkdirSync(caseDir, { recursive: true });

    const setup = {
        ...options.defaultSetup,
        ...(benchmarkCase.setup ?? {}),
    };
    const caseUrl = new URL(setup.route ?? "/", appUrl);
    if (setup.specPath) {
        caseUrl.searchParams.set(
            "spec",
            String(setup.specPath).replace(/^\/+/, "")
        );
    }

    await ensureCasePage(page, caseUrl, options);
    await resetCaseState(
        page,
        options.timeoutMs,
        options.agentModuleBaseUrl,
        options.preflightRetryDelayMs
    );
    const initialState = await readBenchmarkState(
        page,
        benchmarkCase,
        options.agentModuleBaseUrl
    );

    const beforePath = path.join(caseDir, "before.png");
    if (options.screenshots) {
        await page.screenshot({ path: beforePath });
    }

    let execution = await executeBenchmarkPrompt(
        page,
        benchmarkCase.prompt,
        options.timeoutMs,
        {
            agentModuleBaseUrl: options.agentModuleBaseUrl,
            turnMode: options.turnMode,
            autoContinueText: options.autoContinueText,
            maxFollowups: options.maxFollowups,
        }
    );
    let evidence = buildEvidence(execution);
    if (shouldRetryEmptyTurn(evidence)) {
        console.log(
            "Retrying case after empty assistant response with no state changes."
        );
        await resetCaseState(
            page,
            options.timeoutMs,
            options.agentModuleBaseUrl,
            options.preflightRetryDelayMs
        );
        execution = await executeBenchmarkPrompt(
            page,
            benchmarkCase.prompt,
            options.timeoutMs,
            {
                agentModuleBaseUrl: options.agentModuleBaseUrl,
                turnMode: options.turnMode,
                autoContinueText: options.autoContinueText,
                maxFollowups: options.maxFollowups,
            }
        );
        evidence = buildEvidence(execution);
    }

    const finalState = await readBenchmarkState(
        page,
        benchmarkCase,
        options.agentModuleBaseUrl
    );
    const evaluation = evaluateCase(
        benchmarkCase,
        initialState,
        finalState,
        evidence
    );

    const afterPath = path.join(caseDir, "after.png");
    if (options.screenshots) {
        await page.screenshot({ path: afterPath });
    }
    const metrics = buildMetrics(execution, benchmarkCase, evaluation);
    const expectedExecution = summarizeExpectedExecution(benchmarkCase);
    const actualExecution = summarizeActualExecution(evidence);
    const result = {
        caseId: benchmarkCase.id,
        model: options.modelName,
        repeatIndex: options.repeatIndex,
        repeatNumber: options.repeatIndex + 1,
        repeatCount: options.repeats,
        prompt: benchmarkCase.prompt,
        status: evaluation.status,
        checks: evaluation.checks,
        rubric: evaluation.rubric,
        failedRequiredCriteria: evaluation.failedRequiredCriteria,
        expectedExecution,
        actualExecution,
        metrics: {
            ...metrics,
            durationMs: Date.now() - startedAt,
        },
        evidence: {
            finalAnswer: evidence.finalAnswer,
            messages: evidence.messages,
            toolCallNames: evidence.toolCallNames,
            contentKinds: evidence.contentKinds,
            intentActionTypes: evidence.intentActionTypes,
            plotRecords: evidence.plotRecords,
            intentActions: finalState.provenanceActions,
            provenanceActions: finalState.provenanceActions,
            analysisArtifacts: buildAnalysisArtifacts(evidence, finalState),
            turnTrace: evidence.turnTrace,
            continuation: evidence.continuation,
            initialState,
            finalState,
            appState: finalState,
            artifacts: options.screenshots
                ? {
                      beforeScreenshot: path.relative(repoRoot, beforePath),
                      afterScreenshot: path.relative(repoRoot, afterPath),
                  }
                : {},
        },
    };

    const outputPath = path.join(caseDir, "result.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(caseDir, "trace.md"), renderTraceMarkdown(result));

    return result;
}

/**
 * @param {import("playwright").Page} page
 * @param {any} benchmarkCase
 * @param {string} agentModuleBaseUrl
 */
async function readBenchmarkState(page, benchmarkCase, agentModuleBaseUrl) {
    return await page.evaluate(
        async ({ benchmarkCase, agentModuleBaseUrl }) => {
            const benchmarkGlobal = /** @type {any} */ (globalThis);
            const benchmarkState = benchmarkGlobal.__gsAgentBenchmark;
            if (!benchmarkState?.app) {
                throw new Error("Benchmark app handle is missing.");
            }

            const app = benchmarkState.app;
            const sampleView = app.getSampleView?.();
            const sampleHierarchy = sampleView?.sampleHierarchy;
            const provenanceActions =
                app.provenance?.getBookmarkableActionHistory?.() ?? [];

            const { getAgentState } = await import(
                new URL("agent/agentState.js", agentModuleBaseUrl).toString()
            );
            const agentAdapter = getAgentState(app).agentAdapter;
            const volatileContext = agentAdapter?.getAgentVolatileContext?.();
            const expectedState =
                benchmarkCase.rubric?.requirements?.state ?? null;
            const requestedViewVisibilityEntries = [
                ...(expectedState?.viewVisibility ?? []),
                ...((benchmarkCase.rubric?.requirements?.artifacts ?? []).filter(
                    (artifact) => artifact.kind === "viewVisibility"
                ) ?? []),
            ];

            return {
                groupByAttributes:
                    sampleHierarchy?.groupMetadata?.map((entry) =>
                        normalizeAttribute(entry.attribute)
                    ) ?? [],
                sortByAttribute: getLastSortAttribute(provenanceActions),
                visibleSampleCount: sampleHierarchy
                    ? countVisibleSamples(sampleHierarchy.rootGroup)
                    : null,
                metadataAttributesPresent:
                    sampleHierarchy?.sampleMetadata?.attributeNames?.slice() ??
                    [],
                selectionAggregationFieldCount:
                    volatileContext?.selectionAggregation?.fields?.length ?? 0,
                selectionAggregationFields:
                    volatileContext?.selectionAggregation?.fields?.map(
                        (entry) => ({
                            candidateId: entry.candidateId,
                            view: entry.view ?? entry.viewTitle ?? null,
                            field: entry.field ?? null,
                            dataType: entry.dataType ?? entry.type ?? null,
                            supportedAggregations:
                                entry.supportedAggregations ?? [],
                        })
                    ) ?? [],
                selectionAggregationCandidateIds:
                    volatileContext?.selectionAggregation?.fields?.map(
                        (entry) => entry.candidateId
                    ) ?? [],
                zoomedScaleNames:
                    volatileContext?.scaleDomains
                        ?.filter((entry) => entry.zoomed)
                        .map((entry) => entry.name) ?? [],
                activeProvenanceState:
                    volatileContext?.activeProvenanceState ?? null,
                provenanceActionTypes: provenanceActions
                    .map((action) => action?.type)
                    .filter((type) => typeof type === "string"),
                provenanceActions: provenanceActions.map((action) => ({
                    type: action?.type ?? null,
                    payload: cloneJson(action?.payload ?? null),
                })),
                viewVisibility: requestedViewVisibilityEntries.map((entry) => {
                        const view =
                            agentAdapter?.agentApi?.resolveViewSelector?.(
                                entry.selector
                            );
                        return {
                            selector: entry.selector,
                            visible: view ? view.isVisible() : null,
                            resolved: Boolean(view),
                        };
                    }) ?? [],
            };

            function normalizeAttribute(attribute) {
                if (!attribute || typeof attribute !== "object") {
                    return null;
                }

                if (
                    attribute.type === "SAMPLE_ATTRIBUTE" &&
                    typeof attribute.specifier === "string"
                ) {
                    return attribute.specifier;
                }

                if (typeof attribute.specifier === "string") {
                    return attribute.specifier;
                }

                return attribute.type ?? null;
            }

            function getLastSortAttribute(actions) {
                for (let index = actions.length - 1; index >= 0; index -= 1) {
                    const action = actions[index];
                    if (action?.type !== "sampleView/sortBy") {
                        continue;
                    }

                    return normalizeAttribute(action.payload?.attribute);
                }

                return null;
            }

            function countVisibleSamples(group, sampleIds = new Set()) {
                if ("samples" in group) {
                    for (const sampleId of group.samples) {
                        sampleIds.add(sampleId);
                    }
                    return sampleIds.size;
                }

                for (const child of group.groups) {
                    countVisibleSamples(child, sampleIds);
                }

                return sampleIds.size;
            }

            function cloneJson(value) {
                return value === null || value === undefined
                    ? null
                    : JSON.parse(JSON.stringify(value));
            }
        },
        {
            benchmarkCase,
            agentModuleBaseUrl,
        }
    );
}

/**
 * @param {import("playwright").Page} page
 * @param {string} prompt
 * @param {number} timeoutMs
 */
async function executeBenchmarkPrompt(page, prompt, timeoutMs, options) {
    return page.evaluate(
        async ({ prompt, timeoutMs, options }) => {
            const benchmarkGlobal = /** @type {any} */ (globalThis);
            const controller = benchmarkGlobal.__gsAgentBenchmark?.controller;
            if (!controller) {
                throw new Error("Benchmark controller was not initialized.");
            }

            const turnTrace = [];
            let previousMessageCount = controller.getSnapshot().messages.length;
            let snapshot = await sendTurn(prompt);
            turnTrace.push(buildTurnTrace(prompt, snapshot, previousMessageCount));

            let autoContinuedCount = 0;
            const initialFinalAnswer = getFinalAnswerText(snapshot);

            while (
                options.turnMode !== "one-shot" &&
                autoContinuedCount < options.maxFollowups &&
                shouldAutoContinue(getFinalAnswerText(snapshot))
            ) {
                previousMessageCount = snapshot.messages.length;
                snapshot = await sendTurn(options.autoContinueText);
                turnTrace.push(
                    buildTurnTrace(
                        options.autoContinueText,
                        snapshot,
                        previousMessageCount
                    )
                );
                autoContinuedCount += 1;
            }

            return {
                snapshot,
                turnTrace,
                continuation: {
                    turnMode: options.turnMode,
                    autoContinuedCount,
                    initialFinalAnswer,
                    finalAnswer: getFinalAnswerText(snapshot),
                },
            };

            async function sendTurn(message) {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(
                            new Error(
                                "Benchmark case timed out while waiting for the agent turn."
                            )
                        );
                    }, timeoutMs);
                });

                await Promise.race([
                    controller.sendMessage(message),
                    timeoutPromise,
                ]);
                return controller.getSnapshot();
            }

            function buildTurnTrace(promptText, snapshotValue, startIndex) {
                const allMessages = snapshotValue.messages ?? [];
                const newMessages = allMessages.slice(startIndex);

                return {
                    prompt: promptText,
                    newMessages: newMessages.map((message) => ({
                        id: message.id,
                        kind: message.kind,
                        text:
                            typeof message.text === "string"
                                ? message.text
                                : "",
                        toolCalls: message.toolCalls ?? [],
                        toolCallId: message.toolCallId ?? null,
                        lines: message.lines ?? [],
                        content: message.content,
                    })),
                    finalAnswer: getFinalAnswerText(snapshotValue),
                };
            }

            function getFinalAnswerText(snapshotValue) {
                const finalMessage = [...(snapshotValue.messages ?? [])]
                    .reverse()
                    .find(
                        (message) =>
                            message.kind === "assistant" ||
                            message.kind === "error"
                    );
                return typeof finalMessage?.text === "string"
                    ? finalMessage.text
                    : "";
            }

            function shouldAutoContinue(text) {
                const normalized = String(text ?? "").trim().toLowerCase();
                if (!normalized) {
                    return false;
                }

                return [
                    "if you want",
                    "i can continue",
                    "i can proceed",
                    "would you like me to",
                    "if you provide",
                    "if you give me",
                    "i need",
                    "if you'd like",
                    "if you would like",
                ].some((pattern) => normalized.includes(pattern));
            }
        },
        {
            prompt,
            timeoutMs,
            options,
        }
    );
}

/**
 * @param {import("playwright").Page} page
 * @param {URL} caseUrl
 * @param {{
 *     timeoutMs: number;
 *     interactive: boolean;
 *     agentModuleBaseUrl: string;
 *     preflightRetryDelayMs: number;
 * }} options
 */
async function ensureCasePage(page, caseUrl, options) {
    const currentUrl = new URL(page.url());
    const currentBaseUrl =
        currentUrl.origin + currentUrl.pathname + currentUrl.search;
    const targetBaseUrl = caseUrl.origin + caseUrl.pathname + caseUrl.search;

    if (currentBaseUrl !== targetBaseUrl) {
        await page.goto(caseUrl.toString(), { waitUntil: "load" });
        await waitForApp(page, options.timeoutMs);
        await dismissBlockingOverlays(page);
        await installBenchmarkSession(
            page,
            options.timeoutMs,
            options.interactive,
            options.agentModuleBaseUrl,
            options.preflightRetryDelayMs
        );
    }
}

/**
 * @param {import("playwright").Page} page
 * @param {number} timeoutMs
 */
async function waitForApp(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const browserDocument = globalThis.document;
            const RootCustomEvent = globalThis.CustomEvent;
            const root = browserDocument?.querySelector(".genome-spy-app");
            if (!root) {
                return false;
            }

            let app = null;
            root.dispatchEvent(
                new RootCustomEvent("query-dependency", {
                    bubbles: true,
                    composed: true,
                    detail: {
                        name: "app",
                        setter: (value) => {
                            app = value;
                        },
                    },
                })
            );

            if (!app) {
                return false;
            }

            const resolvedApp = /** @type {any} */ (app);
            const sampleHierarchy = resolvedApp.provenance
                .getPresentState?.()
                ?.sampleView;
            const sampleCount = sampleHierarchy?.sampleData?.ids?.length ?? 0;

            return sampleCount > 0;
        },
        {
            timeout: timeoutMs,
        }
    );
}

/**
 * @param {import("playwright").Page} page
 * @param {number} timeoutMs
 */
async function installBenchmarkSession(
    page,
    timeoutMs,
    interactive,
    agentModuleBaseUrl,
    preflightRetryDelayMs
) {
    await page.evaluate(async ({ interactive, agentModuleBaseUrl }) => {
        const benchmarkGlobal = /** @type {any} */ (globalThis);
        if (benchmarkGlobal.__gsAgentBenchmark?.controller) {
            return;
        }

        const browserDocument = globalThis.document;
        const RootCustomEvent = globalThis.CustomEvent;
        const appRoot = browserDocument?.querySelector(".genome-spy-app");
        if (!appRoot) {
            throw new Error("GenomeSpy app root was not found.");
        }

        let app = null;
        appRoot.dispatchEvent(
            new RootCustomEvent("query-dependency", {
                bubbles: true,
                composed: true,
                detail: {
                    name: "app",
                    setter: (value) => {
                        app = value;
                    },
                },
            })
        );

        if (!app) {
            throw new Error("Could not resolve App through query-dependency.");
        }

        const { getAgentState } = await import(
            new URL("agent/agentState.js", agentModuleBaseUrl).toString()
        );
        const { createAgentSessionController } = await import(
            new URL(
                "agent/agentSessionController.js",
                agentModuleBaseUrl
            ).toString()
        );
        const { toggleAgentChatPanel } = await import(
            new URL("agent/chatPanel.js", agentModuleBaseUrl).toString()
        );

        const agentState = getAgentState(app);
        if (!agentState.agentAdapter) {
            throw new Error(
                "Agent runtime is not available. Ensure VITE_AGENT_BASE_URL is configured."
            );
        }

        agentState.agentSessionController ??= createAgentSessionController(
            agentState.agentAdapter
        );

        benchmarkGlobal.__gsAgentBenchmark = {
            app,
            controller: agentState.agentSessionController,
        };

        if (interactive) {
            await toggleAgentChatPanel(app);
        }

        await agentState.agentSessionController.open();
    }, { interactive, agentModuleBaseUrl });

    await ensurePreflightReady(page, timeoutMs, 3, preflightRetryDelayMs);
}

/**
 * Restore the visualization and agent session before every case while keeping
 * the already-loaded data and browser page alive.
 *
 * @param {import("playwright").Page} page
 * @param {number} timeoutMs
 * @param {string} agentModuleBaseUrl
 * @param {number} preflightRetryDelayMs
 */
async function resetCaseState(
    page,
    timeoutMs,
    agentModuleBaseUrl,
    preflightRetryDelayMs
) {
    await page.evaluate(async ({ agentModuleBaseUrl }) => {
        const benchmarkGlobal = /** @type {any} */ (globalThis);
        const benchmarkState = benchmarkGlobal.__gsAgentBenchmark;
        if (!benchmarkState?.app || !benchmarkState?.controller) {
            throw new Error("Benchmark session was not initialized.");
        }

        const { resetToDefaultState } = await import(
            new URL("/bookmark/bookmark.js", globalThis.location.href).toString()
        );
        const { getAgentState } = await import(
            new URL("agent/agentState.js", agentModuleBaseUrl).toString()
        );
        const { clearAgentChatHistory } = await import(
            new URL("agent/chatPanel.js", agentModuleBaseUrl).toString()
        );

        resetToDefaultState(benchmarkState.app);
        await benchmarkState.app.paramProvenanceBridge?.whenApplied?.();

        clearAgentChatHistory(benchmarkState.app);
        benchmarkState.controller = getAgentState(
            benchmarkState.app
        ).agentSessionController;
        await benchmarkState.controller.open();
    }, { agentModuleBaseUrl });

    await ensurePreflightReady(page, timeoutMs, 3, preflightRetryDelayMs);
}

/**
 * @param {import("playwright").Page} page
 * @param {number} timeoutMs
 */
async function waitForPreflight(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const benchmarkGlobal = /** @type {any} */ (globalThis);
            const snapshot =
                benchmarkGlobal.__gsAgentBenchmark?.controller?.getSnapshot?.();
            return (
                snapshot?.preflightState === "ready" ||
                snapshot?.preflightState === "failed"
            );
        },
        {
            timeout: timeoutMs,
        }
    );

    return await page.evaluate(() => {
        const benchmarkGlobal = /** @type {any} */ (globalThis);
        return benchmarkGlobal.__gsAgentBenchmark.controller.getSnapshot();
    });
}

/**
 * @param {import("playwright").Page} page
 * @param {number} timeoutMs
 * @param {number} [maxAttempts=3]
 * @param {number} [retryDelayMs=defaultPreflightRetryDelayMs]
 */
async function ensurePreflightReady(
    page,
    timeoutMs,
    maxAttempts = 3,
    retryDelayMs = defaultPreflightRetryDelayMs
) {
    /** @type {any} */
    let preflightState = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        preflightState = await waitForPreflight(page, timeoutMs);
        if (preflightState.preflightState === "ready") {
            return;
        }

        if (attempt < maxAttempts) {
            console.log(
                `Preflight attempt ${attempt} failed; retrying agent preflight.`
            );
            if (retryDelayMs > 0) {
                await wait(retryDelayMs);
            }
            await page.evaluate(async () => {
                const benchmarkGlobal = /** @type {any} */ (globalThis);
                await benchmarkGlobal.__gsAgentBenchmark.controller.refreshPreflight();
            });
        }
    }

    throw new Error(
        "Agent preflight failed: " + (preflightState?.lastError || "unknown")
    );
}

/**
 * Dismiss spec-driven dialogs such as bookmark tours that can obscure the
 * visualization during interactive benchmark runs.
 *
 * @param {import("playwright").Page} page
 */
async function dismissBlockingOverlays(page) {
    await page.evaluate(() => {
        const bookmarkInfoBox = globalThis.document?.querySelector(
            "gs-bookmark-info-box"
        );
        bookmarkInfoBox?.remove();
    });
}

/**
 * Keep benchmark runs free of spec-driven overlays that obscure the app.
 *
 * @param {import("playwright").Page} page
 */
async function installPageGuards(page) {
    await page.addInitScript(() => {
        const benchmarkGlobal = /** @type {any} */ (globalThis);
        if (benchmarkGlobal.__gsBenchmarkGuardsInstalled) {
            return;
        }

        benchmarkGlobal.__gsBenchmarkGuardsInstalled = true;

        const removeBlockingOverlays = () => {
            globalThis.document
                ?.querySelectorAll("gs-bookmark-info-box")
                .forEach((element) => element.remove());
        };

        const installObserver = () => {
            removeBlockingOverlays();

            const observer = new MutationObserver(() => {
                removeBlockingOverlays();
            });
            observer.observe(globalThis.document.documentElement, {
                childList: true,
                subtree: true,
            });
        };

        if (globalThis.document.readyState === "loading") {
            globalThis.document.addEventListener(
                "DOMContentLoaded",
                installObserver,
                { once: true }
            );
        } else {
            installObserver();
        }
    });
}

/**
 * @param {any} snapshot
 */
function buildEvidence(execution) {
    const snapshot = execution.snapshot ?? execution;
    const messages = snapshot.messages.map((message) => ({
        id: message.id,
        kind: message.kind,
        text: typeof message.text === "string" ? message.text : "",
        toolCalls: message.toolCalls ?? [],
        toolCallId: message.toolCallId ?? null,
        content: message.content,
        lines: message.lines ?? [],
    }));

    const finalAnswer =
        [...messages]
            .reverse()
            .find(
                (message) =>
                    message.kind === "assistant" ||
                    message.kind === "error"
            )?.text ?? "";

    const toolCalls = messages.flatMap((message) =>
        message.kind === "tool_call" ? message.toolCalls ?? [] : []
    );
    const toolCallNames = toolCalls
        .map((toolCall) => toolCall?.name)
        .filter((name) => typeof name === "string");
    const toolResultContents = messages
        .filter((message) => message.kind === "tool_result" && message.content)
        .map((message) => message.content);
    const contentKinds = toolResultContents
        .map((content) => content?.kind)
        .filter((kind) => typeof kind === "string");
    const intentActionTypes = toolCalls
        .flatMap((toolCall) => {
            if (toolCall?.name !== "submitIntentAction") {
                return [];
            }

            const actionType = toolCall.arguments?.action?.actionType;
            return typeof actionType === "string" ? [actionType] : [];
        })
        .concat(
            toolResultContents.flatMap((content) =>
                content?.kind === "intent_batch_result"
                    ? (content.batch?.steps ?? [])
                          .map((step) => step?.actionType)
                          .filter((actionType) => typeof actionType === "string")
                    : []
            )
        );
    const plotRecords = toolResultContents
        .filter((content) => content?.kind === "sample_attribute_plot_record")
        .map((content) => ({
            plotType: content.plotType ?? null,
            title: content.title ?? "",
            summary: content.summary ?? null,
            attribute: content.attribute ?? null,
            attributes: content.attributes ?? [],
        }));
    const scaleZooms = toolResultContents.filter(
        (content) => content?.kind === "scale_zoom"
    );
    const viewStateChanges = toolResultContents.filter(
        (content) => content?.kind === "view_state_change"
    );
    const provenanceActivations = toolResultContents.filter(
        (content) => content?.kind === "provenance_state_activation"
    );
    const datumLookups = toolResultContents.filter(
        (content) => content?.kind === "datum_lookup_result"
    );
    const selectionFeatureFieldSummaries = toolResultContents.filter(
        (content) => content?.kind === "selection_feature_field_summary"
    );
    const metadataValueResolutions = toolResultContents.filter(
        (content) => content?.kind === "metadata_attribute_value_resolution"
    );

    return {
        finalAnswer,
        messages,
        turnTrace: execution.turnTrace ?? [],
        continuation: execution.continuation ?? {
            turnMode: "one-shot",
            autoContinuedCount: 0,
            initialFinalAnswer: finalAnswer,
            finalAnswer,
        },
        toolCalls,
        toolCallNames,
        contentKinds,
        intentActionTypes,
        plotRecords,
        scaleZooms,
        viewStateChanges,
        provenanceActivations,
        datumLookups,
        selectionFeatureFieldSummaries,
        metadataValueResolutions,
    };
}

/**
 * @param {ReturnType<typeof buildEvidence>} evidence
 * @param {any} appState
 */
function buildAnalysisArtifacts(evidence, appState) {
    return {
        contentKinds: evidence.contentKinds,
        plotRecords: evidence.plotRecords,
        scaleZooms: evidence.scaleZooms,
        viewStateChanges: evidence.viewStateChanges,
        provenanceActivations: evidence.provenanceActivations,
        datumLookups: evidence.datumLookups,
        selectionFeatureFieldSummaries: evidence.selectionFeatureFieldSummaries,
        metadataValueResolutions: evidence.metadataValueResolutions,
        selectionAggregationCandidateIds:
            appState.selectionAggregationCandidateIds ?? [],
        selectionAggregationFields:
            appState.selectionAggregationFields ?? [],
        metadataAttributesPresent: appState.metadataAttributesPresent ?? [],
    };
}

/**
 * @param {{
 *   finalAnswer: string;
 *   intentActionTypes: string[];
 *   plotRecords: Array<{ plotType: string | null }>;
 * }} evidence
 */
function shouldRetryEmptyTurn(evidence) {
    return (
        !summarizeText(evidence.finalAnswer) &&
        evidence.intentActionTypes.length === 0 &&
        evidence.plotRecords.length === 0
    );
}

/**
 * @param {any} snapshot
 * @param {any} benchmarkCase
 * @param {{
 *   checks: Array<{ ok: boolean; name: string }>;
 *   rubric?: { score: number; totalWeight: number; normalizedScore: number };
 * }} evaluation
 */
function buildMetrics(snapshot, benchmarkCase, evaluation) {
    const effectiveSnapshot = snapshot.snapshot ?? snapshot;
    const messages = effectiveSnapshot.messages ?? [];
    const toolCallMessages = messages.filter(
        (message) => message.kind === "tool_call"
    );
    const toolCalls = toolCallMessages.flatMap(
        (message) => message.toolCalls ?? []
    );
    const toolCallCount = toolCalls.length;
    const helperToolCallCount = toolCalls.filter(
        (toolCall) =>
            typeof toolCall?.name === "string" &&
            HELPER_TOOL_NAMES.has(toolCall.name)
    ).length;
    const rejectedToolCallCount = messages.filter(
        (message) =>
            message.kind === "tool_result" &&
            typeof message.text === "string" &&
            message.text.startsWith("Tool call was incorrect and rejected.")
    ).length;
    const intentActionCount = toolCalls.filter(
        (toolCall) =>
            toolCall?.name === "submitIntentAction" &&
            typeof toolCall.arguments?.action?.actionType === "string"
    ).length;
    const operationalToolCallCount =
        toolCallCount - helperToolCallCount - intentActionCount;
    const stepCount = messages.filter(
        (message) =>
            message.kind === "tool_call" || message.kind === "assistant"
    ).length;
    const minIntentActions =
        benchmarkCase.rubric?.efficiency?.minIntentActions ?? 0;
    const minToolCalls = benchmarkCase.rubric?.efficiency?.minToolCalls ?? 0;
    const rubricCriteria = evaluation.rubric?.criteria ?? [];
    const allRubricChecks = rubricCriteria.flatMap(
        (criterion) => criterion.checks ?? []
    );
    const requirementsCriterion = rubricCriteria.find(
        (criterion) => criterion.id === "requirements"
    );
    const efficiencyCriterion = rubricCriteria.find(
        (criterion) => criterion.id === "efficiency"
    );
    const requirementsChecks = requirementsCriterion?.checks ?? [];
    const efficiencyChecks = efficiencyCriterion?.checks ?? [];

    return {
        stepCount,
        toolCallCount,
        helperToolCallCount,
        operationalToolCallCount,
        intentActionCount,
        progressCallCount: operationalToolCallCount + intentActionCount,
        rejectedToolCallCount,
        minToolCalls,
        minIntentActions,
        toolCallGap: Math.max(0, toolCallCount - minToolCalls),
        efficiencyGap: Math.max(
            0,
            intentActionCount - minIntentActions
        ),
        rubricCheckCount: allRubricChecks.length,
        rubricCheckPassCount: allRubricChecks.filter((check) => check.ok).length,
        rubricCheckPassRate: roundTo(
            allRubricChecks.length > 0
                ? allRubricChecks.filter((check) => check.ok).length /
                      allRubricChecks.length
                : 0,
            3
        ),
        requirementCheckCount: requirementsChecks.length,
        requirementCheckPassCount: requirementsChecks.filter((check) => check.ok)
            .length,
        requirementCheckPassRate: roundTo(
            requirementsChecks.length > 0
                ? requirementsChecks.filter((check) => check.ok).length /
                      requirementsChecks.length
                : 0,
            3
        ),
        efficiencyCheckCount: efficiencyChecks.length,
        efficiencyCheckPassCount: efficiencyChecks.filter((check) => check.ok)
            .length,
        efficiencyCheckPassRate: roundTo(
            efficiencyChecks.length > 0
                ? efficiencyChecks.filter((check) => check.ok).length /
                      efficiencyChecks.length
                : 0,
            3
        ),
        rubricScore: evaluation.rubric?.score ?? null,
        rubricTotalWeight: evaluation.rubric?.totalWeight ?? null,
        rubricNormalizedScore: evaluation.rubric?.normalizedScore ?? null,
    };
}

/**
 * @param {any} benchmarkCase
 */
function summarizeExpectedExecution(benchmarkCase) {
    const rubric = benchmarkCase.rubric ?? {};
    const requirements = rubric.requirements ?? {};
    const state = requirements.state ?? {};
    const efficiency = rubric.efficiency ?? {};

    return {
        tools: (requirements.tools ?? []).map((tool) =>
            typeof tool === "string" ? tool : tool.name
        ),
        actions: (requirements.actions ?? []).map((action) => {
            if (typeof action === "string") {
                return action;
            }

            if (action.actionTypes) {
                return action.actionTypes.join(" | ");
            }

            return action.actionType;
        }),
        checks: (requirements.checks ?? []).map(
            (check) => check.label ?? check.kind
        ),
        artifacts: (requirements.artifacts ?? []).map((artifact) => {
            if (typeof artifact === "string") {
                return artifact;
            }

            if (artifact.label) {
                return artifact.label;
            }

            if (artifact.kind === "sampleAttributePlot" && artifact.plotType) {
                return `plot:${artifact.plotType}`;
            }

            if (artifact.kind === "derivedMetadataAttribute") {
                return artifact.attribute
                    ? `metadata:${artifact.attribute}`
                    : "derived_metadata_attribute";
            }

            return artifact.kind ?? "artifact";
        }),
        state: summarizeExpectedState(state),
        efficiency: {
            minToolCalls: efficiency.minToolCalls ?? 0,
            minIntentActions: efficiency.minIntentActions ?? 0,
            maxRejectedToolCalls: efficiency.maxRejectedToolCalls ?? 0,
            softMaxToolCalls: efficiency.softMaxToolCalls ?? null,
            softMaxIntentActions: efficiency.softMaxIntentActions ?? null,
        },
    };
}

/**
 * @param {any} state
 */
function summarizeExpectedState(state) {
    /** @type {string[]} */
    const entries = [];

    if (state.groupByAttributes?.length) {
        entries.push(`groupBy=${state.groupByAttributes.join(",")}`);
    }

    if (state.sortByAttribute) {
        entries.push(`sortBy=${state.sortByAttribute}`);
    }

    if (state.visibleSampleCount) {
        entries.push(
            `visibleSampleCount ${state.visibleSampleCount.operator} ${state.visibleSampleCount.value}`
        );
    }

    if (state.metadataAttributesPresent?.length) {
        entries.push(
            `metadataPresent=${state.metadataAttributesPresent.join(",")}`
        );
    }

    if (state.viewVisibility?.length) {
        entries.push(`viewVisibility=${state.viewVisibility.length}`);
    }

    return entries;
}

/**
 * @param {ReturnType<typeof buildEvidence>} evidence
 */
function summarizeActualExecution(evidence) {
    const rejectedToolCallIds = new Set(
        evidence.messages
            .filter(
                (message) =>
                    message.kind === "tool_result" &&
                    typeof message.text === "string" &&
                    message.text.startsWith(
                        "Tool call was incorrect and rejected."
                    ) &&
                    message.toolCallId
            )
            .map((message) => message.toolCallId)
    );

    const steps = evidence.messages.flatMap((message) => {
        if (message.kind !== "tool_call") {
            return [];
        }

        return (message.toolCalls ?? []).map((toolCall) => {
            const actionType = toolCall?.arguments?.action?.actionType;
            const isIntentAction =
                toolCall?.name === "submitIntentAction" &&
                typeof actionType === "string";
            const isHelperTool =
                !isIntentAction &&
                typeof toolCall?.name === "string" &&
                HELPER_TOOL_NAMES.has(toolCall.name);

            return {
                kind: isIntentAction
                    ? "intentAction"
                    : isHelperTool
                      ? "helperTool"
                      : "tool",
                name: isIntentAction ? actionType : toolCall?.name ?? "<unknown>",
                toolName: toolCall?.name ?? "<unknown>",
                rejected: rejectedToolCallIds.has(toolCall?.id),
            };
        });
    });

    return {
        steps,
        rejectedToolCalls: steps.filter((step) => step.rejected).length,
        selectionAggregationUsages: getRecordedIntentActions(evidence, {
            provenanceActions: [],
        })
            .flatMap((action) =>
                extractSelectionAggregationAttributes(action).map((attribute) => ({
                    ...attribute,
                    actionType: action?.type ?? action?.actionType ?? null,
                }))
            )
            .map((attribute) => ({
                candidateId: attribute.candidateId,
                aggregation: attribute.aggregation,
                featureFilter: attribute.featureFilter ?? null,
                actionType: attribute.actionType,
            })),
    };
}

/**
 * @param {any} action
 * @returns {any[]}
 */
function extractSelectionAggregationAttributes(action) {
    /** @type {any[]} */
    const values = [];

    visitJsonValues(action?.payload ?? null, (value) => {
        if (
            value &&
            typeof value === "object" &&
            value.type === "SELECTION_AGGREGATION" &&
            typeof value.candidateId === "string" &&
            typeof value.aggregation === "string"
        ) {
            values.push(value);
        }
    });

    return values;
}

/**
 * @param {any} actualState
 * @param {ReturnType<typeof buildEvidence>} evidence
 */
function getResolvedSelectionAggregationUsages(actualState, evidence) {
    const fieldsByCandidateId = new Map(
        (actualState.selectionAggregationFields ?? []).map((field) => [
            field.candidateId,
            field,
        ])
    );

    return summarizeActualExecution(evidence).selectionAggregationUsages.map(
        (usage) => ({
            ...fieldsByCandidateId.get(usage.candidateId),
            ...usage,
        })
    );
}

/**
 * @param {any} benchmarkCase
 * @param {any} initialState
 * @param {any} finalState
 * @param {{ finalAnswer: string }} evidence
 */
function evaluateCase(benchmarkCase, initialState, finalState, evidence) {
    const rubric = evaluateRubric(
        benchmarkCase,
        initialState,
        finalState,
        evidence
    );
    const failedRequiredCriteria = rubric.criteria.filter(
        (criterion) => criterion.required && !criterion.ok
    );
    const passesRubricThreshold =
        rubric.totalWeight === 0 ||
        rubric.normalizedScore >= rubric.passingScore;

    return {
        status:
            failedRequiredCriteria.length === 0 && passesRubricThreshold
                ? "passed"
                : "failed",
        checks: [],
        rubric,
        failedRequiredCriteria: failedRequiredCriteria.map((criterion) => ({
            id: criterion.id,
            label: criterion.label,
            category: criterion.category,
        })),
    };
}

/**
 * @param {any} benchmarkCase
 * @param {any} initialState
 * @param {any} finalState
 * @param {any} evidence
 */
function evaluateRubric(benchmarkCase, initialState, finalState, evidence) {
    const rubric = normalizeRubric(benchmarkCase);
    const criteria = rubric.criteria.map((criterion, index) =>
        evaluateRubricCriterion(
            index,
            criterion,
            initialState,
            finalState,
            evidence
        )
    );
    const totalWeight = criteria.reduce(
        (sum, criterion) => sum + criterion.weight,
        0
    );
    const score = criteria.reduce(
        (sum, criterion) => sum + criterion.score,
        0
    );
    const normalizedScore =
        totalWeight > 0 ? Math.round((score / totalWeight) * 1000) / 1000 : 1;

    return {
        version: rubric.version,
        passingScore: rubric.passingScore,
        score,
        totalWeight,
        normalizedScore,
        criteria,
    };
}

/**
 * @param {any} benchmarkCase
 */
function normalizeRubric(benchmarkCase) {
    const rubric = benchmarkCase.rubric;
    if (!rubric || !hasStructuredRubric(rubric)) {
        throw new Error(
            `Benchmark case ${benchmarkCase.id ?? "<unknown>"} is missing a supported structured rubric.`
        );
    }
    const criteria = rubric.criteria?.length
        ? rubric.criteria
        : createStructuredRubricCriteria(rubric, benchmarkCase);

    return {
        version: rubric.version ?? 1,
        passingScore:
            rubric.scoring?.passingScore ??
            rubric.passingScore ??
            1,
        criteria,
    };
}

/**
 * @param {any} rubric
 */
function hasStructuredRubric(rubric) {
    return Boolean(
        rubric.initialState ||
            rubric.requirements ||
            rubric.validAlternatives ||
            rubric.answerRubric ||
            rubric.efficiency ||
            rubric.scoring
    );
}

/**
 * @param {any} rubric
 * @param {any} benchmarkCase
 */
function createStructuredRubricCriteria(rubric, benchmarkCase) {
    const requirements = rubric.requirements ?? {};
    const weights = rubric.scoring?.weights ?? {};
    /** @type {any[]} */
    const criteria = [];

    const requiredPathChecks = buildRequirementChecks(requirements);
    if (requiredPathChecks.length > 0 || rubric.validAlternatives?.length) {
        criteria.push({
            id: "requirements",
            label: "Minimum required tools and actions",
            category: "requirements",
            weight: weights.requirements ?? 0.35,
            required: true,
            checks: [
                ...requiredPathChecks,
                ...buildAlternativeChecks(rubric.validAlternatives ?? []),
            ],
        });
    }

    const requiredState =
        requirements.state ??
        requirements.requiredState ??
        rubric.targetState?.requiredState;
    if (requiredState) {
        criteria.push({
            id: "state",
            label: "Minimum task-relevant state",
            category: "state",
            weight: weights.state ?? 0.25,
            required: true,
            expectedState: requiredState,
        });
    }

    const artifactChecks = buildArtifactChecks(requirements.artifacts ?? []);
    if (artifactChecks.length > 0) {
        criteria.push({
            id: "artifacts",
            label: "Required analysis artifacts",
            category: "artifacts",
            weight: weights.artifacts ?? 0.2,
            required: true,
            checks: artifactChecks,
        });
    }

    const answerRubric =
        rubric.answerRubric ?? benchmarkCase.oracle?.expectedAnswer ?? null;
    if (answerRubric) {
        criteria.push({
            id: "answer",
            label: "Grounded final answer",
            category: "answer",
            weight: weights.answer ?? 0.15,
            required: true,
            expectedAnswer: answerRubric,
        });
    }

    criteria.push({
        id: "efficiency",
        label: "Efficient execution",
        category: "efficiency",
        weight: weights.efficiency ?? 0.05,
        required: false,
        checks: buildEfficiencyChecks(rubric.efficiency ?? {}),
    });

    return criteria;
}

/**
 * @param {any} requirements
 */
function buildRequirementChecks(requirements) {
    return [
        ...(requirements.tools ?? []).map((tool) => ({
            kind: "toolCalled",
            name: typeof tool === "string" ? tool : tool.name,
            label: typeof tool === "string" ? tool : tool.label,
        })),
        ...(requirements.actions ?? []).map((action) => {
            if (typeof action === "string") {
                return {
                    kind: "intentActionExecuted",
                    actionType: action,
                    label: action,
                };
            }

            if (action.actionTypes) {
                return {
                    kind: "intentActionExecutedAnyOf",
                    actionTypes: action.actionTypes,
                    label: action.label,
                };
            }

            return {
                kind: "intentActionExecuted",
                actionType: action.actionType,
                label: action.label,
            };
        }),
        ...(requirements.checks ?? []),
    ];
}

/**
 * @param {any[]} artifacts
 */
function buildArtifactChecks(artifacts) {
    return artifacts.map((artifact) => {
        if (typeof artifact === "string") {
            return {
                kind: "contentKind",
                value: artifact,
                label: artifact,
            };
        }

        if (artifact.check) {
            return artifact.check;
        }

        if (artifact.kind === "sampleAttributePlot") {
            return {
                kind: "plotShown",
                plotType: artifact.plotType,
                label: artifact.label ?? artifact.plotType,
            };
        }

        if (artifact.kind === "derivedMetadataAttribute") {
            return artifact.attribute
                ? {
                      kind: "metadataAttributePresent",
                      attribute: artifact.attribute,
                      label: artifact.label ?? artifact.attribute,
                  }
                : {
                      kind: "metadataAttributeCountDelta",
                      operator: "gte",
                      value: 1,
                      label: artifact.label ?? "derived_metadata_attribute",
                  };
        }

        if (artifact.kind === "metadataSummary") {
            return {
                kind: "toolCalled",
                name: artifact.toolName ?? "getAttributeSummary",
                label: artifact.label ?? "metadata_summary",
            };
        }

        if (artifact.kind === "metadataValueResolution") {
            return {
                kind: "contentKind",
                value: "metadata_attribute_value_resolution",
                label: artifact.label ?? "metadata_value_resolution",
            };
        }

        if (artifact.kind === "selectionSummary") {
            return {
                kind: "contentKind",
                value: "selection_feature_field_summary",
                label: artifact.label ?? "selection_summary",
            };
        }

        if (artifact.kind === "searchResult") {
            return {
                kind: "toolCalled",
                name: artifact.toolName ?? "searchViewDatums",
                label: artifact.label ?? "search_result",
            };
        }

        if (artifact.kind === "zoomResult") {
            return {
                kind: "toolCalled",
                name: artifact.toolName ?? "zoomToScale",
                label: artifact.label ?? "zoom_result",
            };
        }

        if (artifact.kind === "datumLookup") {
            return {
                kind: "contentKind",
                value: "datum_lookup_result",
                label: artifact.label ?? "datum_lookup",
            };
        }

        if (artifact.kind === "provenanceActivation") {
            return {
                kind: "provenanceActivation",
                initial: artifact.initial,
                changed: artifact.changed,
                label: artifact.label ?? "provenance_activation",
            };
        }

        if (artifact.kind === "viewVisibility") {
            return artifact;
        }

        return {
            kind: "contentKind",
            value: artifact.contentKind ?? artifact.kind,
            label: artifact.label ?? artifact.kind,
        };
    });
}

/**
 * @param {any[]} validAlternatives
 */
function buildAlternativeChecks(validAlternatives) {
    return validAlternatives.map((alternative, index) => ({
        kind: "anyOf",
        label: alternative.label ?? `alternative_${index + 1}`,
        alternatives: alternative.paths ?? alternative.alternatives ?? [],
    }));
}

/**
 * @param {any} efficiency
 */
function buildEfficiencyChecks(efficiency) {
    return [
        {
            kind: "maxRejectedToolCalls",
            value: efficiency.maxRejectedToolCalls ?? 0,
            label: "no_rejected_tool_calls",
        },
        ...(efficiency.minToolCalls === undefined
            ? []
            : [
                  {
                      kind: "minToolCalls",
                      value: efficiency.minToolCalls,
                      label: "minimum_tool_calls",
                  },
              ]),
        ...(efficiency.minIntentActions === undefined
            ? []
            : [
                  {
                      kind: "minIntentActions",
                      value: efficiency.minIntentActions,
                      label: "minimum_intent_actions",
                  },
              ]),
        ...(efficiency.softMaxToolCalls === undefined
            ? []
            : [
                  {
                      kind: "maxToolCalls",
                      value: efficiency.softMaxToolCalls,
                      label: "soft_max_tool_calls",
                  },
              ]),
        ...(efficiency.softMaxIntentActions === undefined
            ? []
            : [
                  {
                      kind: "maxIntentActions",
                      value: efficiency.softMaxIntentActions,
                      label: "soft_max_intent_actions",
                  },
              ]),
    ];
}

/**
 * @param {number} index
 * @param {any} criterion
 * @param {any} initialState
 * @param {any} finalState
 * @param {any} evidence
 */
function evaluateRubricCriterion(
    index,
    criterion,
    initialState,
    finalState,
    evidence
) {
    const id = criterion.id ?? `criterion_${index + 1}`;
    const weight = criterion.weight ?? 1;
    const checks = evaluateRubricCriterionChecks(
        id,
        criterion,
        initialState,
        finalState,
        evidence
    );
    const ok = checks.length === 0 || checks.every((check) => check.ok);

    return {
        id,
        label: criterion.label ?? id,
        category: criterion.category ?? "general",
        weight,
        required: criterion.required ?? true,
        score: ok ? weight : 0,
        ok,
        checks,
    };
}

/**
 * @param {string} criterionId
 * @param {any} criterion
 * @param {any} initialState
 * @param {any} finalState
 * @param {any} evidence
 */
function evaluateRubricCriterionChecks(
    criterionId,
    criterion,
    initialState,
    finalState,
    evidence
) {
    /** @type {Array<{ name: string; ok: boolean; detail?: string }>} */
    const checks = [];

    for (const [index, check] of (criterion.checks ?? []).entries()) {
        checks.push(
            evaluateRubricCheck(
                criterionId,
                index,
                check,
                initialState,
                finalState,
                evidence
            )
        );
    }

    if (criterion.expectedState) {
        checks.push(
            ...evaluateExpectedStateChecks(
                criterionId + ":state",
                criterion.expectedState,
                finalState
            )
        );
    }

    if (criterion.expectedAnswer) {
        checks.push(
            ...evaluateExpectedAnswerChecks(
                criterionId + ":answer",
                criterion.expectedAnswer,
                finalState,
                evidence
            )
        );
    }

    return checks;
}

/**
 * @param {string} criterionId
 * @param {number} index
 * @param {any} check
 * @param {any} initialState
 * @param {any} finalState
 * @param {any} evidence
 */
function evaluateRubricCheck(
    criterionId,
    index,
    check,
    initialState,
    finalState,
    evidence
) {
    if (check.kind === "anyOf") {
        const alternativeResults = check.alternatives.map((alternative) => {
            const checks = [
                ...buildRequirementChecks(alternative),
                ...buildArtifactChecks(alternative.artifacts ?? []),
            ].map((alternativeCheck, alternativeIndex) =>
                evaluateRubricCheck(
                    criterionId,
                    alternativeIndex,
                    alternativeCheck,
                    initialState,
                    finalState,
                    evidence
                )
            );

            if (alternative.state || alternative.requiredState) {
                checks.push(
                    ...evaluateExpectedStateChecks(
                        `rubric:${criterionId}:${check.label}:state`,
                        alternative.state ?? alternative.requiredState,
                        finalState
                    )
                );
            }

            return {
                ok: checks.every((result) => result.ok),
                checks,
            };
        });
        const ok = alternativeResults.some((alternative) => alternative.ok);

        return {
            name: `rubric:${criterionId}:${check.label ?? check.kind}`,
            ok,
            detail: ok
                ? "one alternative path matched"
                : `no alternative path matched ${JSON.stringify(
                      alternativeResults.map((result) =>
                          result.checks
                              .filter((alternativeCheck) => !alternativeCheck.ok)
                              .map((alternativeCheck) => alternativeCheck.name)
                      )
                  )}`,
        };
    }

    if (check.kind === "maxRejectedToolCalls") {
        const rejectedToolCallCount = evidence.messages.filter(
            (message) =>
                message.kind === "tool_result" &&
                typeof message.text === "string" &&
                message.text.startsWith("Tool call was incorrect and rejected.")
        ).length;
        const ok = rejectedToolCallCount <= check.value;

        return {
            name: `rubric:${criterionId}:${check.label ?? check.kind}`,
            ok,
            detail: `expected at most ${check.value} rejected tool calls, got ${rejectedToolCallCount}`,
        };
    }

    if (check.kind === "minToolCalls" || check.kind === "maxToolCalls") {
        const ok =
            check.kind === "minToolCalls"
                ? evidence.toolCalls.length >= check.value
                : evidence.toolCalls.length <= check.value;

        return {
            name: `rubric:${criterionId}:${check.label ?? check.kind}`,
            ok,
            detail: `expected ${check.kind === "minToolCalls" ? "at least" : "at most"} ${check.value} tool calls, got ${evidence.toolCalls.length}`,
        };
    }

    if (
        check.kind === "minIntentActions" ||
        check.kind === "maxIntentActions"
    ) {
        const ok =
            check.kind === "minIntentActions"
                ? evidence.intentActionTypes.length >= check.value
                : evidence.intentActionTypes.length <= check.value;

        return {
            name: `rubric:${criterionId}:${check.label ?? check.kind}`,
            ok,
            detail: `expected ${check.kind === "minIntentActions" ? "at least" : "at most"} ${check.value} intent actions, got ${evidence.intentActionTypes.length}`,
        };
    }

    if (check.kind === "metadataAttributeCountDelta") {
        const initialCount = initialState.metadataAttributesPresent.length;
        const finalCount = finalState.metadataAttributesPresent.length;
        const actualDelta = finalCount - initialCount;
        const ok = compareNumber(actualDelta, check.operator, check.value);

        return {
            name: `rubric:${criterionId}:${check.label ?? check.kind}`,
            ok,
            detail: `expected metadataAttributeCountDelta ${check.operator} ${check.value}, got ${actualDelta}`,
        };
    }

    if (check.kind === "selectionAggregationUsageValue") {
        const actualValues = getResolvedSelectionAggregationUsages(
            finalState,
            evidence
        )
            .filter(
                (usage) =>
                    !check.actionType || usage.actionType === check.actionType
            )
            .map((usage) => getValueAtPath(usage, check.path))
            .filter((value) => value !== undefined);
        const expectedValues = check.values ?? [check.value];
        const ok = actualValues.some((actualValue) =>
            expectedValues.some((expectedValue) =>
                deepEqual(actualValue, expectedValue)
            )
        );

        return {
            name: `rubric:${criterionId}:${check.label ?? check.kind}`,
            ok,
            detail: `expected resolved selection aggregation usage at ${check.path} to equal any of ${JSON.stringify(
                expectedValues
            )}, got ${JSON.stringify(actualValues)}`,
        };
    }

    const subgoalCheck = evaluateSemanticCheck(
        index,
        check,
        finalState,
        evidence
    );

    return {
        ...subgoalCheck,
        name:
            "rubric:" +
            criterionId +
            ":" +
            subgoalCheck.name.replace(/^check:/, ""),
    };
}

/**
 * @param {string} prefix
 * @param {any} expectedState
 * @param {any} actualState
 */
function evaluateExpectedStateChecks(prefix, expectedState, actualState) {
    /** @type {Array<{ name: string; ok: boolean; detail?: string }>} */
    const checks = [];

    if (expectedState.groupByAttributes) {
        checks.push({
            name: `${prefix}:groupByAttributes`,
            ok: arraysEqual(
                actualState.groupByAttributes,
                expectedState.groupByAttributes
            ),
            detail: `expected ${JSON.stringify(
                expectedState.groupByAttributes
            )}, got ${JSON.stringify(actualState.groupByAttributes)}`,
        });
    }

    if (expectedState.sortByAttribute) {
        checks.push({
            name: `${prefix}:sortByAttribute`,
            ok: actualState.sortByAttribute === expectedState.sortByAttribute,
            detail: `expected ${expectedState.sortByAttribute}, got ${actualState.sortByAttribute}`,
        });
    }

    if (expectedState.visibleSampleCount) {
        checks.push({
            name: `${prefix}:visibleSampleCount`,
            ok: compareNumber(
                actualState.visibleSampleCount,
                expectedState.visibleSampleCount.operator,
                expectedState.visibleSampleCount.value
            ),
            detail: `expected ${expectedState.visibleSampleCount.operator} ${expectedState.visibleSampleCount.value}, got ${actualState.visibleSampleCount}`,
        });
    }

    if (expectedState.metadataAttributesPresent) {
        for (const attributeName of expectedState.metadataAttributesPresent) {
            checks.push({
                name: `${prefix}:metadataAttributesPresent:${attributeName}`,
                ok: actualState.metadataAttributesPresent.includes(attributeName),
                detail: `missing ${attributeName}`,
            });
        }
    }

    if (expectedState.viewVisibility) {
        for (const expectation of expectedState.viewVisibility) {
            const actual = actualState.viewVisibility.find((entry) =>
                deepEqual(entry.selector, expectation.selector)
            );
            checks.push({
                name: `${prefix}:viewVisibility:${JSON.stringify(
                    expectation.selector
                )}`,
                ok:
                    Boolean(actual?.resolved) &&
                    actual.visible === expectation.visible,
                detail: actual
                    ? `expected ${expectation.visible}, got ${actual.visible}`
                    : "view selector did not resolve",
            });
        }
    }

    return checks;
}

/**
 * @param {string} prefix
 * @param {any} expectedAnswer
 * @param {any} actualState
 * @param {any} evidence
 */
function evaluateExpectedAnswerChecks(
    prefix,
    expectedAnswer,
    actualState,
    evidence
) {
    /** @type {Array<{ name: string; ok: boolean; detail?: string }>} */
    const checks = [];
    const normalizedAnswer = evidence.finalAnswer.toLowerCase();

    if (expectedAnswer.requiredStateForAnswer?.length) {
        for (const [index, subgoal] of expectedAnswer.requiredStateForAnswer.entries()) {
            const groundingCheck = evaluateSemanticCheck(
                index,
                subgoal,
                actualState,
                evidence
            );
            checks.push({
                ...groundingCheck,
                name:
                    `${prefix}:grounding:` +
                    groundingCheck.name.replace(/^check:/, ""),
            });
        }
    }

    if (expectedAnswer.mustContainAny?.length) {
        checks.push({
            name: `${prefix}:mustContainAny`,
            ok: expectedAnswer.mustContainAny.some((term) =>
                normalizedAnswer.includes(String(term).toLowerCase())
            ),
            detail: `expected any of ${JSON.stringify(
                expectedAnswer.mustContainAny
            )} in ${JSON.stringify(evidence.finalAnswer)}`,
        });
    }

    if (expectedAnswer.mustContainAll?.length) {
        for (const term of expectedAnswer.mustContainAll) {
            checks.push({
                name: `${prefix}:mustContainAll:${term}`,
                ok: normalizedAnswer.includes(String(term).toLowerCase()),
                detail: `missing ${term}`,
            });
        }
    }

    if (expectedAnswer.mustNotContain?.length) {
        for (const term of expectedAnswer.mustNotContain) {
            checks.push({
                name: `${prefix}:mustNotContain:${term}`,
                ok: !normalizedAnswer.includes(String(term).toLowerCase()),
                detail: `answer contained forbidden term ${term}`,
            });
        }
    }

    if (expectedAnswer.mustContainNumberCountAtLeast) {
        const numbers = extractNumbers(evidence.finalAnswer);
        checks.push({
            name: `${prefix}:mustContainNumberCountAtLeast`,
            ok: numbers.length >= expectedAnswer.mustContainNumberCountAtLeast,
            detail: `expected at least ${expectedAnswer.mustContainNumberCountAtLeast} numbers, got ${JSON.stringify(
                numbers
            )}`,
        });
    }

    if (expectedAnswer.mustContainComparisonSignal) {
        const comparisonSignals = Array.isArray(
            expectedAnswer.mustContainComparisonSignal
        )
            ? expectedAnswer.mustContainComparisonSignal
            : DEFAULT_COMPARISON_SIGNALS;
        checks.push({
            name: `${prefix}:mustContainComparisonSignal`,
            ok: comparisonSignals.some((term) =>
                normalizedAnswer.includes(String(term).toLowerCase())
            ),
            detail: `expected comparison signal from ${JSON.stringify(
                comparisonSignals
            )} in ${JSON.stringify(evidence.finalAnswer)}`,
        });
    }

    if (expectedAnswer.mustMentionGroupsWithNumbers?.length) {
        for (const group of expectedAnswer.mustMentionGroupsWithNumbers) {
            checks.push({
                name: `${prefix}:mustMentionGroupsWithNumbers:${group}`,
                ok: mentionsGroupWithNumber(normalizedAnswer, String(group)),
                detail: `expected ${group} near a numeric value in ${JSON.stringify(
                    evidence.finalAnswer
                )}`,
            });
        }
    }

    if (expectedAnswer.factSlots) {
        const factSlots = /** @type {Record<string, string>} */ (
            expectedAnswer.factSlots
        );
        for (const [slot, expectedValue] of Object.entries(factSlots)) {
            checks.push({
                name: `${prefix}:factSlots:${slot}`,
                ok: normalizedAnswer.includes(String(expectedValue).toLowerCase()),
                detail: `expected value ${expectedValue} in answer`,
            });
        }
    }

    if (expectedAnswer.numericSlots) {
        const numbers = extractNumbers(evidence.finalAnswer);
        const numericSlots =
            /** @type {Record<string, { value: number; tolerance?: number }>} */ (
                expectedAnswer.numericSlots
            );
        for (const [slot, expected] of Object.entries(numericSlots)) {
            const tolerance = expected.tolerance ?? 0;
            const ok = numbers.some(
                (value) => Math.abs(value - expected.value) <= tolerance
            );
            checks.push({
                name: `${prefix}:numericSlots:${slot}`,
                ok,
                detail: `expected ${expected.value} +/- ${tolerance}, got ${JSON.stringify(
                    numbers
                )}`,
            });
        }
    }

    return checks;
}

/**
 * @param {number} index
 * @param {any} subgoal
 * @param {any} actualState
 * @param {any} evidence
 */
function evaluateSemanticCheck(index, subgoal, actualState, evidence) {
    const label = subgoal.label ?? subgoal.kind ?? `subgoal_${index + 1}`;

    if (subgoal.kind === "toolCalled") {
        const ok = evidence.toolCallNames.includes(subgoal.name);
        return {
            name: `check:${label}`,
            ok,
            detail: `expected tool ${subgoal.name}, got ${JSON.stringify(
                evidence.toolCallNames
            )}`,
        };
    }

    if (subgoal.kind === "toolCalledAnyOf") {
        const ok = subgoal.names.some((name) =>
            evidence.toolCallNames.includes(name)
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected any tool of ${JSON.stringify(
                subgoal.names
            )}, got ${JSON.stringify(evidence.toolCallNames)}`,
        };
    }

    if (subgoal.kind === "contentKind") {
        const ok = evidence.contentKinds.includes(subgoal.value);
        return {
            name: `check:${label}`,
            ok,
            detail: `expected content kind ${subgoal.value}, got ${JSON.stringify(
                evidence.contentKinds
            )}`,
        };
    }

    if (subgoal.kind === "intentActionExecuted") {
        const ok = subgoal.attribute
            ? hasIntentActionWithAttribute(
                  evidence,
                  actualState,
                  subgoal.actionType,
                  subgoal.attribute
              )
            : evidence.intentActionTypes.includes(subgoal.actionType);
        return {
            name: `check:${label}`,
            ok,
            detail: `expected action ${subgoal.actionType}${
                subgoal.attribute ? " using " + subgoal.attribute : ""
            }, got ${JSON.stringify(evidence.intentActionTypes)}`,
        };
    }

    if (subgoal.kind === "intentActionExecutedAnyOf") {
        const ok = subgoal.actionTypes.some((actionType) =>
            evidence.intentActionTypes.includes(actionType)
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected any action of ${JSON.stringify(
                subgoal.actionTypes
            )}, got ${JSON.stringify(evidence.intentActionTypes)}`,
        };
    }

    if (subgoal.kind === "intentActionPayloadValue") {
        const actions = getRecordedIntentActions(evidence, actualState).filter(
            (action) =>
                action?.type === subgoal.actionType ||
                action?.actionType === subgoal.actionType
        );
        const actualValues = actions
            .map((action) => getValueAtPath(action, subgoal.path))
            .filter((value) => value !== undefined);
        const expectedValues = subgoal.values ?? [subgoal.value];
        const ok = actualValues.some((actualValue) =>
            expectedValues.some((expectedValue) =>
                deepEqual(actualValue, expectedValue)
            )
        );

        return {
            name: `check:${label}`,
            ok,
            detail: `expected ${subgoal.actionType} at ${subgoal.path} to equal any of ${JSON.stringify(
                expectedValues
            )}, got ${JSON.stringify(actualValues)}`,
        };
    }

    if (subgoal.kind === "plotShown") {
        const actualPlotTypes = evidence.plotRecords.map((plot) => plot.plotType);
        const ok = actualPlotTypes.includes(subgoal.plotType);
        return {
            name: `check:${label}`,
            ok,
            detail: `expected plot ${subgoal.plotType}, got ${JSON.stringify(
                actualPlotTypes
            )}`,
        };
    }

    if (subgoal.kind === "selectionAggregationFieldCount") {
        const ok = compareNumber(
            actualState.selectionAggregationFieldCount,
            subgoal.operator,
            subgoal.value
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected selectionAggregationFieldCount ${subgoal.operator} ${subgoal.value}, got ${actualState.selectionAggregationFieldCount}`,
        };
    }

    if (subgoal.kind === "metadataAttributePresent") {
        const ok = actualState.metadataAttributesPresent.includes(
            subgoal.attribute
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected metadata attribute ${subgoal.attribute}, got ${JSON.stringify(
                actualState.metadataAttributesPresent
            )}`,
        };
    }

    if (subgoal.kind === "groupByAttributes") {
        const ok = arraysEqual(actualState.groupByAttributes, subgoal.attributes);
        return {
            name: `check:${label}`,
            ok,
            detail: `expected ${JSON.stringify(
                subgoal.attributes
            )}, got ${JSON.stringify(actualState.groupByAttributes)}`,
        };
    }

    if (subgoal.kind === "sortByAttribute") {
        const ok = actualState.sortByAttribute === subgoal.attribute;
        return {
            name: `check:${label}`,
            ok,
            detail: `expected ${subgoal.attribute}, got ${actualState.sortByAttribute}`,
        };
    }

    if (subgoal.kind === "visibleSampleCount") {
        const ok = compareNumber(
            actualState.visibleSampleCount,
            subgoal.operator,
            subgoal.value
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected visibleSampleCount ${subgoal.operator} ${subgoal.value}, got ${actualState.visibleSampleCount}`,
        };
    }

    if (subgoal.kind === "zoomedScale") {
        const ok = subgoal.scaleName
            ? actualState.zoomedScaleNames.includes(subgoal.scaleName)
            : actualState.zoomedScaleNames.length > 0;
        return {
            name: `check:${label}`,
            ok,
            detail: `expected zoomed scale ${subgoal.scaleName ?? "<any>"}, got ${JSON.stringify(
                actualState.zoomedScaleNames
            )}`,
        };
    }

    if (subgoal.kind === "viewVisibility") {
        const actual = actualState.viewVisibility.find((entry) =>
            deepEqual(entry.selector, subgoal.selector)
        );
        return {
            name: `check:${label}`,
            ok: Boolean(actual?.resolved) && actual.visible === subgoal.visible,
            detail: actual
                ? `expected ${subgoal.visible}, got ${actual.visible}`
                : "view selector did not resolve",
        };
    }

    if (subgoal.kind === "finalAnswerContainsAny") {
        const normalizedAnswer = evidence.finalAnswer.toLowerCase();
        const ok = subgoal.terms.some((term) =>
            normalizedAnswer.includes(String(term).toLowerCase())
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected any of ${JSON.stringify(
                subgoal.terms
            )} in ${JSON.stringify(evidence.finalAnswer)}`,
        };
    }

    if (subgoal.kind === "provenanceActivation") {
        const ok = evidence.provenanceActivations.some(
            (entry) =>
                (subgoal.initial === undefined ||
                    entry.initial === subgoal.initial) &&
                (subgoal.changed === undefined ||
                    entry.changed === subgoal.changed)
        );
        return {
            name: `check:${label}`,
            ok,
            detail: `expected provenance activation matching ${JSON.stringify(
                {
                    initial: subgoal.initial,
                    changed: subgoal.changed,
                }
            )}`,
        };
    }

    throw new Error("Unsupported benchmark check kind " + subgoal.kind + ".");
}

/**
 * @param {any[]} results
 */
function summarizeSuite(results) {
    const summary = {
        totalRuns: results.length,
        passed: 0,
        failed: 0,
        errored: 0,
        passRate: 0,
        averageDurationMs: 0,
        averageStepCount: 0,
        averageRubricScore: 0,
        averageToolCallCount: 0,
        averageIntentActionCount: 0,
        averageRejectedToolCallCount: 0,
        rejectedToolCallRate: 0,
        autoContinuedRuns: 0,
        autoContinuedPasses: 0,
        oneShotPasses: 0,
        requirementsCheckPassRate: 0,
        efficiencyCheckPassRate: 0,
        cases: summarizeCases(results),
    };

    let totalToolCalls = 0;
    let totalRejectedToolCalls = 0;
    let totalIntentActions = 0;
    let requirementChecksPassed = 0;
    let requirementChecksTotal = 0;
    let efficiencyChecksPassed = 0;
    let efficiencyChecksTotal = 0;

    for (const result of results) {
        if (result.status === "passed") {
            summary.passed += 1;
        } else if (result.status === "failed") {
            summary.failed += 1;
        } else {
            summary.errored += 1;
        }

        totalToolCalls += result.metrics.toolCallCount ?? 0;
        totalRejectedToolCalls += result.metrics.rejectedToolCallCount ?? 0;
        totalIntentActions += result.metrics.intentActionCount ?? 0;

        const autoContinuedCount =
            result.evidence?.continuation?.autoContinuedCount ?? 0;
        if (autoContinuedCount > 0) {
            summary.autoContinuedRuns += 1;
            if (result.status === "passed") {
                summary.autoContinuedPasses += 1;
            }
        } else if (result.status === "passed") {
            summary.oneShotPasses += 1;
        }

        const requirementsCriterion = result.rubric?.criteria?.find(
            (criterion) => criterion.id === "requirements"
        );
        for (const check of requirementsCriterion?.checks ?? []) {
            requirementChecksTotal += 1;
            if (check.ok) {
                requirementChecksPassed += 1;
            }
        }

        const efficiencyCriterion = result.rubric?.criteria?.find(
            (criterion) => criterion.id === "efficiency"
        );
        for (const check of efficiencyCriterion?.checks ?? []) {
            efficiencyChecksTotal += 1;
            if (check.ok) {
                efficiencyChecksPassed += 1;
            }
        }
    }

    if (results.length > 0) {
        summary.passRate = roundTo(summary.passed / results.length, 3);
        summary.averageDurationMs =
            Math.round(
                (results.reduce(
                    (sum, result) => sum + result.metrics.durationMs,
                    0
                ) /
                    results.length) *
                    10
            ) / 10;
        summary.averageStepCount =
            Math.round(
                (results.reduce(
                    (sum, result) => sum + result.metrics.stepCount,
                    0
                ) /
                    results.length) *
                    10
            ) / 10;
        summary.averageRubricScore =
            Math.round(
                (results.reduce(
                    (sum, result) =>
                        sum + (result.metrics.rubricNormalizedScore ?? 0),
                    0
                ) /
                    results.length) *
                    1000
            ) / 1000;
        summary.averageToolCallCount = roundTo(totalToolCalls / results.length, 2);
        summary.averageIntentActionCount = roundTo(
            totalIntentActions / results.length,
            2
        );
        summary.averageRejectedToolCallCount = roundTo(
            totalRejectedToolCalls / results.length,
            2
        );
        summary.rejectedToolCallRate = roundTo(
            totalToolCalls > 0 ? totalRejectedToolCalls / totalToolCalls : 0,
            3
        );
        summary.requirementsCheckPassRate = roundTo(
            requirementChecksTotal > 0
                ? requirementChecksPassed / requirementChecksTotal
                : 0,
            3
        );
        summary.efficiencyCheckPassRate = roundTo(
            efficiencyChecksTotal > 0
                ? efficiencyChecksPassed / efficiencyChecksTotal
                : 0,
            3
        );
    }

    return summary;
}

/**
 * @param {any} result
 */
function printCaseResult(result) {
    printWrappedLine(`Prompt: ${result.prompt}`);
    printWrappedLine(
        `Result: ${result.status} | ${result.metrics.durationMs} ms | steps ${result.metrics.stepCount} | tool calls ${result.metrics.toolCallCount} | helper tools ${result.metrics.helperToolCallCount} | operational tools ${result.metrics.operationalToolCallCount} | intent actions ${result.metrics.intentActionCount} | progress calls ${result.metrics.progressCallCount}`
    );
    if (result.rubric) {
        printWrappedLine(
            `Rubric: ${formatDecimal(result.rubric.score)}/${formatDecimal(
                result.rubric.totalWeight
            )} (${formatDecimal(result.rubric.normalizedScore * 100, 1)}%)`
        );
        printWrappedLine(
            `Checks: rubric ${result.metrics.rubricCheckPassCount}/${result.metrics.rubricCheckCount} (${formatDecimal(result.metrics.rubricCheckPassRate * 100, 1)}%) | requirements ${result.metrics.requirementCheckPassCount}/${result.metrics.requirementCheckCount} (${formatDecimal(result.metrics.requirementCheckPassRate * 100, 1)}%) | efficiency ${result.metrics.efficiencyCheckPassCount}/${result.metrics.efficiencyCheckCount} (${formatDecimal(result.metrics.efficiencyCheckPassRate * 100, 1)}%)`
        );
    }
    if ((result.evidence?.continuation?.autoContinuedCount ?? 0) > 0) {
        printWrappedLine(
            `Continuation: auto-continued ${result.evidence.continuation.autoContinuedCount} follow-up turn(s)`
        );
    }

    const summaryText = summarizeText(result.evidence.finalAnswer);
    if (summaryText) {
        printWrappedLine(`Answer: ${summaryText}`);
    } else if (result.evidence.toolCallNames?.length === 0) {
        console.log("Answer: <empty assistant response>");
    }

    printExpectedExecution(result.expectedExecution);
    printActualExecution(result.actualExecution);
    printRubricBreakdown(
        result.rubric,
        result.evidence.analysisArtifacts?.selectionAggregationFields,
        result.actualExecution
    );

    const failedChecks = result.checks.filter((check) => !check.ok);
    if (failedChecks.length > 0) {
        for (const check of failedChecks) {
            console.log(`Failed check: ${check.name} - ${check.detail ?? ""}`);
        }
    }

    console.log("");
}

/**
 * @param {any} summary
 */
function printSuiteSummary(summary) {
    console.log("Suite summary:");
    printWrappedLine(
        `  Runs: ${summary.totalRuns} | passed ${summary.passed} | failed ${summary.failed} | errored ${summary.errored} | pass rate ${formatDecimal(summary.passRate * 100, 1)}%`
    );
    printWrappedLine(
        `  Avg duration ${summary.averageDurationMs} ms | avg steps ${summary.averageStepCount} | avg rubric ${formatDecimal(summary.averageRubricScore * 100, 1)}%`
    );
    printWrappedLine(
        `  Avg tool calls ${summary.averageToolCallCount} | avg intent actions ${summary.averageIntentActionCount} | rejected tool-call rate ${formatDecimal(summary.rejectedToolCallRate * 100, 1)}%`
    );
    printWrappedLine(
        `  Requirement checks pass ${formatDecimal(summary.requirementsCheckPassRate * 100, 1)}% | efficiency checks pass ${formatDecimal(summary.efficiencyCheckPassRate * 100, 1)}%`
    );
    printWrappedLine(
        `  One-shot passes ${summary.oneShotPasses} | auto-continued runs ${summary.autoContinuedRuns} | auto-continued passes ${summary.autoContinuedPasses}`
    );
}

/**
 * @param {any} expectedExecution
 */
function printExpectedExecution(expectedExecution) {
    if (!expectedExecution) {
        return;
    }

    console.log("Expected minimum:");

    if (expectedExecution.tools.length > 0) {
        printWrappedLine(
            `  Tools: ${expectedExecution.tools.join(" -> ")}`
        );
    }

    if (expectedExecution.actions.length > 0) {
        printWrappedLine(
            `  Actions: ${expectedExecution.actions.join(" -> ")}`
        );
    }

    if (expectedExecution.checks.length > 0) {
        printWrappedLine(
            `  Checks: ${expectedExecution.checks.join(", ")}`
        );
    }

    if (expectedExecution.artifacts.length > 0) {
        printWrappedLine(
            `  Artifacts: ${expectedExecution.artifacts.join(", ")}`
        );
    }

    if (expectedExecution.state.length > 0) {
        printWrappedLine(`  State: ${expectedExecution.state.join(" | ")}`);
    }

    printWrappedLine(
        `  Efficiency: tools >= ${expectedExecution.efficiency.minToolCalls}, actions >= ${expectedExecution.efficiency.minIntentActions}, rejected <= ${expectedExecution.efficiency.maxRejectedToolCalls}`
    );
}

/**
 * @param {any} actualExecution
 */
function printActualExecution(actualExecution) {
    console.log("Actual sequence:");

    if (!actualExecution?.steps?.length) {
        console.log("  <no tool calls>");
        return;
    }

    for (const [index, step] of actualExecution.steps.entries()) {
        const prefix =
            step.kind === "intentAction"
                ? "action"
                : step.kind === "helperTool"
                  ? "helper"
                  : "tool";
        const suffix = step.rejected ? " [rejected]" : "";
        printWrappedLine(`  ${index + 1}. ${prefix} ${step.name}${suffix}`);
    }
}

/**
 * @param {any} rubric
 * @param {any[] | undefined} selectionAggregationFields
 * @param {any} actualExecution
 */
function printRubricBreakdown(
    rubric,
    selectionAggregationFields,
    actualExecution
) {
    if (!rubric?.criteria?.length) {
        return;
    }

    console.log("Rubric breakdown:");

    for (const criterion of rubric.criteria) {
        const status = criterion.ok ? "PASS" : "FAIL";
        printWrappedLine(
            `  ${status} ${criterion.id} ${formatDecimal(
                criterion.score
            )}/${formatDecimal(criterion.weight)} - ${criterion.label}`
        );

        for (const check of criterion.checks) {
            const checkStatus = check.ok ? "PASS" : "FAIL";
            printWrappedLine(
                `    ${checkStatus} ${check.name}: ${check.detail ?? (check.ok ? "passed" : "failed")}`
            );

            if (isSelectionAggregationUsageCheck(check)) {
                printSelectionAggregationUsage(
                    selectionAggregationFields,
                    actualExecution,
                    check
                );
            }
        }
    }
}

/**
 * @param {any} check
 */
function isSelectionAggregationUsageCheck(check) {
    return (
        typeof check?.detail === "string" &&
        (check.detail.includes("payload.attribute.aggregation") ||
            check.detail.includes("resolved selection aggregation usage"))
    );
}

/**
 * @param {any[] | undefined} fields
 */
function printSelectionAggregationCandidates(fields) {
    if (!fields?.length) {
        return;
    }

    for (const field of fields) {
        const description = [
            field.candidateId,
            field.field ? `field=${field.field}` : null,
            field.view ? `view=${field.view}` : null,
            field.dataType ? `type=${field.dataType}` : null,
        ]
            .filter(Boolean)
            .join(" | ");
        printWrappedLine(`      candidate ${description}`);
    }
}

/**
 * @param {any[] | undefined} fields
 * @param {any} actualExecution
 * @param {any} check
 */
function printSelectionAggregationUsage(fields, actualExecution, check) {
    if (!actualExecution?.selectionAggregationUsages?.length) {
        return;
    }

    const fieldsByCandidateId = new Map(
        (fields ?? []).map((field) => [field.candidateId, field])
    );

    for (const usage of actualExecution.selectionAggregationUsages) {
        const field = fieldsByCandidateId.get(usage.candidateId);
        const description = describeSelectionAggregationUsage(
            usage,
            field,
            check
        );
        printWrappedLine(`      used ${description}`);
    }
}

/**
 * @param {any} usage
 * @param {any} field
 * @param {any} check
 */
function describeSelectionAggregationUsage(usage, field, check) {
    const path = inferSelectionAggregationUsagePath(check);

    if (path === "payload.attribute.aggregation") {
        return [usage.candidateId, `aggregation=${usage.aggregation}`]
            .filter(Boolean)
            .join(" | ");
    }

    if (path === "view") {
        return [
            usage.candidateId,
            field?.view ? `view=${field.view}` : null,
        ]
            .filter(Boolean)
            .join(" | ");
    }

    if (path === "dataType") {
        return [
            usage.candidateId,
            field?.dataType ? `type=${field.dataType}` : null,
        ]
            .filter(Boolean)
            .join(" | ");
    }

    return [
        usage.candidateId,
        `aggregation=${usage.aggregation}`,
        field?.field ? `field=${field.field}` : null,
        field?.view ? `view=${field.view}` : null,
        field?.dataType ? `type=${field.dataType}` : null,
        usage.featureFilter
            ? `featureFilter=${JSON.stringify(usage.featureFilter)}`
            : null,
    ]
        .filter(Boolean)
        .join(" | ");
}

/**
 * @param {any} check
 */
function inferSelectionAggregationUsagePath(check) {
    const detail = typeof check?.detail === "string" ? check.detail : "";

    if (detail.includes("payload.attribute.aggregation")) {
        return "payload.attribute.aggregation";
    }

    const pathMatch = detail.match(/ at ([A-Za-z0-9._]+) to equal /);
    return pathMatch?.[1] ?? null;
}

/**
 * @param {string} text
 */
function printWrappedLine(text) {
    for (const line of wrapText(text)) {
        console.log(line);
    }
}

/**
 * @param {string} text
 * @param {number} [width]
 */
function wrapText(text, width = getConsoleWidth()) {
    const indentMatch = text.match(/^\s*/);
    const indent = indentMatch?.[0] ?? "";
    const content = text.slice(indent.length);
    const availableWidth = Math.max(40, width - indent.length);
    const words = content.split(/\s+/).filter(Boolean);

    if (words.length === 0 || indent.length + content.length <= width) {
        return [text];
    }

    /** @type {string[]} */
    const lines = [];
    let current = indent;

    for (const word of words) {
        const separator = current === indent ? "" : " ";
        if ((current + separator + word).length <= width) {
            current += separator + word;
            continue;
        }

        if (current !== indent) {
            lines.push(current);
            current = indent + word;
            continue;
        }

        const chunks = chunkWord(word, availableWidth);
        lines.push(...chunks.slice(0, -1).map((chunk) => indent + chunk));
        current = indent + chunks[chunks.length - 1];
    }

    if (current !== indent) {
        lines.push(current);
    }

    return lines;
}

function getConsoleWidth() {
    return process.stdout.columns
        ? Math.max(60, Math.min(process.stdout.columns, 120))
        : 100;
}

/**
 * @param {string} word
 * @param {number} width
 */
function chunkWord(word, width) {
    /** @type {string[]} */
    const chunks = [];

    for (let index = 0; index < word.length; index += width) {
        chunks.push(word.slice(index, index + width));
    }

    return chunks;
}

/**
 * @param {unknown} value
 * @param {(value: any) => void} visitor
 */
function visitJsonValues(value, visitor) {
    visitor(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            visitJsonValues(item, visitor);
        }
        return;
    }

    if (value && typeof value === "object") {
        for (const child of Object.values(value)) {
            visitJsonValues(child, visitor);
        }
    }
}

/**
 * @param {number | null | undefined} value
 * @param {number} [digits]
 */
function formatDecimal(value, digits = 2) {
    if (!Number.isFinite(value)) {
        return "0";
    }

    return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

/**
 * @param {number} value
 * @param {number} digits
 */
function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/**
 * @param {string[]} args
 */
function parseArgs(args) {
    /** @type {{
     *   help: boolean;
     *   caseFile: string;
     *   caseId: string | undefined;
     *   caseMode: "all" | "action" | "description";
     *   appUrl: string | undefined;
     *   agentUrl: string;
     *   outputDir: string | undefined;
     *   interactive: boolean;
     *   screenshots: boolean;
     *   quietBrowserWarnings: boolean;
     *   timeoutMs: number;
     *   caseDelayMs: number;
     *   preflightRetryDelayMs: number;
     *   repeats: number;
     *   turnMode: "one-shot" | "continuable";
     *   autoContinueText: string;
     *   maxFollowups: number;
     *   modelName: string;
     * }} */
    const options = {
        help: false,
        caseFile: defaultCaseFile,
        caseId: undefined,
        caseMode: "all",
        appUrl: undefined,
        agentUrl: defaultAgentUrl,
        outputDir: undefined,
        interactive: false,
        screenshots: false,
        quietBrowserWarnings: false,
        timeoutMs: defaultTimeoutMs,
        caseDelayMs: defaultCaseDelayMs,
        preflightRetryDelayMs: defaultPreflightRetryDelayMs,
        repeats: defaultRepeats,
        turnMode: defaultTurnMode,
        autoContinueText: defaultAutoContinueText,
        maxFollowups: defaultMaxFollowups,
        modelName: defaultModelName,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") {
            options.help = true;
        } else if (arg === "--case-file") {
            options.caseFile = resolvePathArg(args[++index], "--case-file");
        } else if (arg === "--case-id") {
            options.caseId = requireArg(args[++index], "--case-id");
        } else if (arg === "--case-mode") {
            const caseMode = requireArg(args[++index], "--case-mode");
            if (
                caseMode !== "all" &&
                caseMode !== "action" &&
                caseMode !== "description"
            ) {
                throw new Error(
                    "Expected --case-mode to be one of: all, action, description."
                );
            }
            options.caseMode = caseMode;
        } else if (arg === "--app-url") {
            options.appUrl = requireArg(args[++index], "--app-url");
        } else if (arg === "--agent-url") {
            options.agentUrl = requireArg(args[++index], "--agent-url");
        } else if (arg === "--output-dir") {
            options.outputDir = resolvePathArg(args[++index], "--output-dir");
        } else if (arg === "--interactive") {
            options.interactive = true;
        } else if (arg === "--screenshots") {
            options.screenshots = true;
        } else if (arg === "--quiet-browser-warnings") {
            options.quietBrowserWarnings = true;
        } else if (arg === "--timeout-ms") {
            const timeoutMs = Number(requireArg(args[++index], "--timeout-ms"));
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                throw new Error(
                    "Expected a positive numeric value for --timeout-ms."
                );
            }
            options.timeoutMs = timeoutMs;
        } else if (arg === "--case-delay-ms") {
            const caseDelayMs = Number(
                requireArg(args[++index], "--case-delay-ms")
            );
            if (!Number.isFinite(caseDelayMs) || caseDelayMs < 0) {
                throw new Error(
                    "Expected a non-negative numeric value for --case-delay-ms."
                );
            }
            options.caseDelayMs = caseDelayMs;
        } else if (arg === "--preflight-retry-delay-ms") {
            const preflightRetryDelayMs = Number(
                requireArg(args[++index], "--preflight-retry-delay-ms")
            );
            if (
                !Number.isFinite(preflightRetryDelayMs) ||
                preflightRetryDelayMs < 0
            ) {
                throw new Error(
                    "Expected a non-negative numeric value for --preflight-retry-delay-ms."
                );
            }
            options.preflightRetryDelayMs = preflightRetryDelayMs;
        } else if (arg === "--repeats") {
            const repeats = Number(requireArg(args[++index], "--repeats"));
            if (!Number.isInteger(repeats) || repeats <= 0) {
                throw new Error(
                    "Expected a positive integer value for --repeats."
                );
            }
            options.repeats = repeats;
        } else if (arg === "--turn-mode") {
            const turnMode = requireArg(args[++index], "--turn-mode");
            if (turnMode !== "one-shot" && turnMode !== "continuable") {
                throw new Error(
                    "Expected --turn-mode to be one of: one-shot, continuable."
                );
            }
            options.turnMode = turnMode;
        } else if (arg === "--auto-continue-text") {
            options.autoContinueText = requireArg(
                args[++index],
                "--auto-continue-text"
            );
        } else if (arg === "--max-followups") {
            const maxFollowups = Number(
                requireArg(args[++index], "--max-followups")
            );
            if (!Number.isInteger(maxFollowups) || maxFollowups < 0) {
                throw new Error(
                    "Expected a non-negative integer value for --max-followups."
                );
            }
            options.maxFollowups = maxFollowups;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }

    return options;
}

/**
 * @param {string} filePath
 */
function loadCaseFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * @param {{ cases?: any[] }} suite
 * @param {string | undefined} caseId
 * @param {"all" | "action" | "description"} caseMode
 */
function selectCases(suite, caseId, caseMode) {
    const cases = (suite.cases ?? []).filter((benchmarkCase) =>
        matchesCaseMode(benchmarkCase, caseMode)
    );
    if (!caseId) {
        return cases;
    }

    return cases.filter((benchmarkCase) => benchmarkCase.id === caseId);
}

/**
 * @param {any} result
 */
function renderTraceMarkdown(result) {
    const sections = [];
    sections.push(`# ${result.caseId}`);
    sections.push("");
    sections.push(`- Model: ${result.model ?? "unknown"}`);
    sections.push(`- Prompt: ${result.prompt}`);
    sections.push(`- Status: ${result.status}`);
    sections.push(
        `- Repeat: ${result.repeatNumber}/${result.repeatCount}`
    );
    sections.push(
        `- Duration: ${result.metrics.durationMs} ms`
    );
    sections.push(
        `- Rubric: ${formatDecimal(result.rubric?.score ?? 0)}/${formatDecimal(
            result.rubric?.totalWeight ?? 0
        )} (${formatDecimal((result.rubric?.normalizedScore ?? 0) * 100, 1)}%)`
    );
    sections.push(
        `- Check pass rate: ${result.metrics.rubricCheckPassCount}/${result.metrics.rubricCheckCount} (${formatDecimal((result.metrics.rubricCheckPassRate ?? 0) * 100, 1)}%)`
    );
    sections.push(
        `- Requirement check pass rate: ${result.metrics.requirementCheckPassCount}/${result.metrics.requirementCheckCount} (${formatDecimal((result.metrics.requirementCheckPassRate ?? 0) * 100, 1)}%)`
    );
    sections.push(
        `- Efficiency check pass rate: ${result.metrics.efficiencyCheckPassCount}/${result.metrics.efficiencyCheckCount} (${formatDecimal((result.metrics.efficiencyCheckPassRate ?? 0) * 100, 1)}%)`
    );
    sections.push(
        `- Auto-continued turns: ${result.evidence?.continuation?.autoContinuedCount ?? 0}`
    );
    sections.push("");
    sections.push("## Final Answer");
    sections.push("");
    sections.push(result.evidence.finalAnswer || "<empty>");
    sections.push("");
    sections.push("## Turn Trace");
    sections.push("");

    const turnTrace = result.evidence.turnTrace ?? [];
    if (turnTrace.length === 0) {
        sections.push("_No turn trace available._");
        sections.push("");
    } else {
        for (const [index, turn] of turnTrace.entries()) {
            sections.push(`### Turn ${index + 1}`);
            sections.push("");
            sections.push(`**User**: ${turn.prompt}`);
            sections.push("");
            for (const message of turn.newMessages ?? []) {
                sections.push(...renderTraceMessage(message));
            }
        }
    }

    sections.push("## Expected Minimum");
    sections.push("");
    sections.push(`- Tools: ${result.expectedExecution.tools.join(", ") || "<none>"}`);
    sections.push(`- Actions: ${result.expectedExecution.actions.join(", ") || "<none>"}`);
    sections.push(`- Checks: ${result.expectedExecution.checks.join(", ") || "<none>"}`);
    sections.push("");
    sections.push("## Actual Sequence");
    sections.push("");
    for (const [index, step] of (result.actualExecution.steps ?? []).entries()) {
        sections.push(
            `${index + 1}. ${step.kind} ${step.name}${step.rejected ? " [rejected]" : ""}`
        );
    }
    if ((result.actualExecution.steps ?? []).length === 0) {
        sections.push("<no tool calls>");
    }
    sections.push("");
    sections.push("## Rubric Breakdown");
    sections.push("");
    for (const criterion of result.rubric?.criteria ?? []) {
        sections.push(
            `- ${criterion.ok ? "PASS" : "FAIL"} ${criterion.id}: ${criterion.label}`
        );
        for (const check of criterion.checks ?? []) {
            sections.push(
                `  - ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail ?? ""}`
            );
        }
    }
    sections.push("");
    return sections.join("\n");
}

/**
 * @param {any} message
 */
function renderTraceMessage(message) {
    const lines = [];
    if (message.kind === "tool_call") {
        lines.push(`**Agent / tool call**: ${message.text || "<no note>"}`);
        lines.push("");
        for (const toolCall of message.toolCalls ?? []) {
            lines.push(`- \`${toolCall.name}\``);
            lines.push("");
        }
        return lines;
    }

    if (message.kind === "tool_result") {
        lines.push(`**Tool result**: ${message.text || "<empty>"}`);
        lines.push("");
        return lines;
    }

    if (message.kind === "assistant") {
        lines.push(`**Assistant**: ${message.text || "<empty>"}`);
        lines.push("");
        return lines;
    }

    if (message.kind === "result") {
        lines.push(`**Action summary**: ${message.text || "<empty>"}`);
        lines.push("");
        return lines;
    }

    if (message.kind === "error") {
        lines.push(`**Error**: ${message.text || "<empty>"}`);
        lines.push("");
        return lines;
    }

    return [];
}

/**
 * @param {any} suite
 * @param {any} options
 * @param {any[]} results
 * @param {any} summary
 */
function renderSuiteSummaryMarkdown(suite, options, results, summary) {
    const caseResultsById = groupBy(results, (result) => result.caseId);
    const lines = [];
    lines.push("# Suite Summary");
    lines.push("");
    lines.push(`- Suite: ${suite.visualizationId ?? path.basename(options.caseFile)}`);
    lines.push(`- Case file: ${path.relative(repoRoot, options.caseFile)}`);
    lines.push(`- Model: ${options.modelName}`);
    lines.push(`- Repeats: ${options.repeats}`);
    lines.push(`- Turn mode: ${options.turnMode}`);
    lines.push(`- Auto continue text: ${options.autoContinueText}`);
    lines.push("");
    lines.push("## Metrics");
    lines.push("");
    lines.push(`- Runs: ${summary.totalRuns}`);
    lines.push(`- Passed: ${summary.passed}`);
    lines.push(`- Failed: ${summary.failed}`);
    lines.push(`- Errored: ${summary.errored}`);
    lines.push(`- Pass rate: ${formatDecimal(summary.passRate * 100, 1)}%`);
    lines.push(`- Average rubric score: ${formatDecimal(summary.averageRubricScore * 100, 1)}%`);
    lines.push(`- Average duration: ${summary.averageDurationMs} ms`);
    lines.push(`- Average step count: ${summary.averageStepCount}`);
    lines.push(`- Average tool calls: ${summary.averageToolCallCount}`);
    lines.push(`- Average intent actions: ${summary.averageIntentActionCount}`);
    lines.push(`- Rejected tool-call rate: ${formatDecimal(summary.rejectedToolCallRate * 100, 1)}%`);
    lines.push(`- Requirement check pass rate: ${formatDecimal(summary.requirementsCheckPassRate * 100, 1)}%`);
    lines.push(`- Efficiency check pass rate: ${formatDecimal(summary.efficiencyCheckPassRate * 100, 1)}%`);
    lines.push(`- One-shot passes: ${summary.oneShotPasses}`);
    lines.push(`- Auto-continued runs: ${summary.autoContinuedRuns}`);
    lines.push(`- Auto-continued passes: ${summary.autoContinuedPasses}`);
    lines.push("");
    lines.push("## Cases");
    lines.push("");
    for (const caseSummary of summary.cases) {
        lines.push(`### ${caseSummary.caseId}`);
        lines.push("");
        lines.push(`- Runs: ${caseSummary.runs}`);
        lines.push(`- Passed: ${caseSummary.passed}`);
        lines.push(`- Failed: ${caseSummary.failed}`);
        lines.push(`- Pass rate: ${formatDecimal(caseSummary.passRate * 100, 1)}%`);
        lines.push(`- Average rubric score: ${formatDecimal(caseSummary.averageRubricScore * 100, 1)}%`);
        lines.push(`- Auto-continued runs: ${caseSummary.autoContinuedRuns}`);
        lines.push(`- Trace files: ${caseSummary.traceFiles.map((entry) => `\`${entry}\``).join(", ") || "<none>"}`);
        lines.push("");
    }

    lines.push("## Case Details");
    lines.push("");
    for (const caseSummary of summary.cases) {
        const caseResults = caseResultsById.get(caseSummary.caseId) ?? [];
        const firstResult = caseResults[0];
        lines.push(`### ${caseSummary.caseId}`);
        lines.push("");
        lines.push(`- Prompt: ${firstResult?.prompt ?? "<unknown>"}`);
        lines.push(`- Runs: ${caseSummary.runs}`);
        lines.push(`- Passed: ${caseSummary.passed}`);
        lines.push(`- Failed: ${caseSummary.failed}`);
        lines.push(`- Errored: ${caseSummary.errored}`);
        lines.push(`- Pass rate: ${formatDecimal(caseSummary.passRate * 100, 1)}%`);
        lines.push(`- Average rubric score: ${formatDecimal(caseSummary.averageRubricScore * 100, 1)}%`);
        lines.push(`- Average duration: ${caseSummary.averageDurationMs} ms`);
        lines.push(`- Average step count: ${caseSummary.averageStepCount}`);
        lines.push(`- Average tool calls: ${caseSummary.averageToolCallCount}`);
        lines.push(`- Average intent actions: ${caseSummary.averageIntentActionCount}`);
        lines.push(`- Average rejected tool calls: ${caseSummary.averageRejectedToolCallCount}`);
        lines.push(`- Rejected tool-call rate: ${formatDecimal(caseSummary.rejectedToolCallRate * 100, 1)}%`);
        lines.push(`- Rubric check pass rate: ${formatDecimal(caseSummary.averageRubricCheckPassRate * 100, 1)}%`);
        lines.push(`- Requirement check pass rate: ${formatDecimal(caseSummary.averageRequirementCheckPassRate * 100, 1)}%`);
        lines.push(`- Efficiency check pass rate: ${formatDecimal(caseSummary.averageEfficiencyCheckPassRate * 100, 1)}%`);
        lines.push(`- Auto-continued runs: ${caseSummary.autoContinuedRuns}`);
        lines.push("");
        lines.push("#### Common Failed Checks");
        lines.push("");
        const commonFailedChecks = summarizeCommonFailedChecks(caseResults);
        if (commonFailedChecks.length > 0) {
            for (const failedCheck of commonFailedChecks) {
                lines.push(
                    `- ${failedCheck.name}: ${failedCheck.count}/${caseResults.length} runs`
                );
            }
        } else {
            lines.push("- <none>");
        }
        lines.push("");
        lines.push("#### Runs");
        lines.push("");
        for (const result of caseResults) {
            const runLabel =
                caseResults.length > 1
                    ? `run-${String(result.repeatNumber).padStart(3, "0")}`
                    : "run";
            const tracePath =
                caseResults.length > 1
                    ? `${runLabel}/trace.md`
                    : "trace.md";
            lines.push(
                `- ${runLabel}: ${result.status}, rubric ${formatDecimal((result.rubric?.normalizedScore ?? 0) * 100, 1)}%, checks ${formatDecimal((result.metrics?.rubricCheckPassRate ?? 0) * 100, 1)}%, auto-continued ${result.evidence?.continuation?.autoContinuedCount ?? 0}, trace \`${tracePath}\``
            );
        }
        if (caseResults.length === 0) {
            lines.push("- <no runs>");
        }
        lines.push("");
    }
    return lines.join("\n");
}

/**
 * @param {string} caseDir
 * @param {any[]} results
 */
function writeCaseAggregateArtifacts(caseDir, results) {
    const aggregate = summarizeCaseRuns(results);
    fs.writeFileSync(
        path.join(caseDir, "aggregate.json"),
        JSON.stringify(aggregate, null, 2)
    );
    const lines = [];
    lines.push(`# ${aggregate.caseId}`);
    lines.push("");
    lines.push(`- Model: ${aggregate.modelName}`);
    lines.push(`- Runs: ${aggregate.runs}`);
    lines.push(`- Passed: ${aggregate.passed}`);
    lines.push(`- Failed: ${aggregate.failed}`);
    lines.push(`- Pass rate: ${formatDecimal(aggregate.passRate * 100, 1)}%`);
    lines.push(`- Average rubric score: ${formatDecimal(aggregate.averageRubricScore * 100, 1)}%`);
    lines.push(`- Average duration: ${aggregate.averageDurationMs} ms`);
    lines.push(`- Average tool calls: ${aggregate.averageToolCallCount}`);
    lines.push(`- Auto-continued runs: ${aggregate.autoContinuedRuns}`);
    lines.push(`- Check pass rate: ${formatDecimal(aggregate.averageRubricCheckPassRate * 100, 1)}%`);
    lines.push(`- Requirement check pass rate: ${formatDecimal(aggregate.averageRequirementCheckPassRate * 100, 1)}%`);
    lines.push(`- Efficiency check pass rate: ${formatDecimal(aggregate.averageEfficiencyCheckPassRate * 100, 1)}%`);
    lines.push("");
    lines.push("## Runs");
    lines.push("");
    for (const result of results) {
        const runDir = "run-" + String(result.repeatNumber).padStart(3, "0");
        lines.push(
            `- ${runDir}: ${result.status}, rubric ${formatDecimal((result.rubric?.normalizedScore ?? 0) * 100, 1)}%, trace \`${runDir}/trace.md\``
        );
    }
    lines.push("");
    fs.writeFileSync(path.join(caseDir, "aggregate.md"), lines.join("\n"));
}

/**
 * @param {any[]} results
 */
function summarizeCases(results) {
    return Array.from(
        groupBy(results, (result) => result.caseId).values(),
        (caseResults) => summarizeCaseRuns(caseResults)
    );
}

/**
 * @param {any[]} results
 */
function summarizeCaseRuns(results) {
    const passed = results.filter((result) => result.status === "passed").length;
    const failed = results.filter((result) => result.status === "failed").length;
    const errored = results.length - passed - failed;
    const totalToolCalls = results.reduce(
        (sum, result) => sum + (result.metrics?.toolCallCount ?? 0),
        0
    );
    const totalRejectedToolCalls = results.reduce(
        (sum, result) => sum + (result.metrics?.rejectedToolCallCount ?? 0),
        0
    );
    return {
        caseId: results[0]?.caseId ?? "<unknown>",
        modelName: results[0]?.model ?? "unknown",
        runs: results.length,
        passed,
        failed,
        errored,
        passRate: roundTo(results.length > 0 ? passed / results.length : 0, 3),
        averageRubricScore: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) =>
                          sum + (result.rubric?.normalizedScore ?? 0),
                      0
                  ) / results.length
                : 0,
            3
        ),
        averageDurationMs: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) => sum + (result.metrics?.durationMs ?? 0),
                      0
                  ) / results.length
                : 0,
            1
        ),
        averageStepCount: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) => sum + (result.metrics?.stepCount ?? 0),
                      0
                  ) / results.length
                : 0,
            2
        ),
        averageToolCallCount: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) =>
                          sum + (result.metrics?.toolCallCount ?? 0),
                      0
                  ) / results.length
                : 0,
            2
        ),
        averageIntentActionCount: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) =>
                          sum + (result.metrics?.intentActionCount ?? 0),
                      0
                  ) / results.length
                : 0,
            2
        ),
        averageRejectedToolCallCount: roundTo(
            results.length > 0
                ? totalRejectedToolCalls / results.length
                : 0,
            2
        ),
        rejectedToolCallRate: roundTo(
            totalToolCalls > 0 ? totalRejectedToolCalls / totalToolCalls : 0,
            3
        ),
        averageRubricCheckPassRate: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) =>
                          sum + (result.metrics?.rubricCheckPassRate ?? 0),
                      0
                  ) / results.length
                : 0,
            3
        ),
        averageRequirementCheckPassRate: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) =>
                          sum + (result.metrics?.requirementCheckPassRate ?? 0),
                      0
                  ) / results.length
                : 0,
            3
        ),
        averageEfficiencyCheckPassRate: roundTo(
            results.length > 0
                ? results.reduce(
                      (sum, result) =>
                          sum + (result.metrics?.efficiencyCheckPassRate ?? 0),
                      0
                  ) / results.length
                : 0,
            3
        ),
        autoContinuedRuns: results.filter(
            (result) => (result.evidence?.continuation?.autoContinuedCount ?? 0) > 0
        ).length,
        traceFiles: results.map((result) =>
            results.length > 1
                ? `${"run-" + String(result.repeatNumber).padStart(3, "0")}/trace.md`
                : "trace.md"
        ),
    };
}

/**
 * @param {any[]} results
 */
function summarizeCommonFailedChecks(results) {
    /** @type {Map<string, number>} */
    const counts = new Map();

    for (const result of results) {
        for (const criterion of result.rubric?.criteria ?? []) {
            for (const check of criterion.checks ?? []) {
                if (check.ok) {
                    continue;
                }

                const rawCheckName = String(check.name ?? "").replace(
                    /^rubric:[^:]+:/,
                    ""
                );
                const name = `${criterion.label}: ${rawCheckName}`;
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }
    }

    return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }

            return a.name.localeCompare(b.name);
        });
}

/**
 * @template T
 * @param {T[]} values
 * @param {(value: T) => string} keyFn
 */
function groupBy(values, keyFn) {
    /** @type {Map<string, T[]>} */
    const groups = new Map();
    for (const value of values) {
        const key = keyFn(value);
        const group = groups.get(key);
        if (group) {
            group.push(value);
        } else {
            groups.set(key, [value]);
        }
    }
    return groups;
}

/**
 * @param {any} benchmarkCase
 * @param {"all" | "action" | "description"} caseMode
 */
function matchesCaseMode(benchmarkCase, caseMode) {
    if (caseMode === "all") {
        return true;
    }

    if (caseMode === "description") {
        return (
            benchmarkCase.outcomeType === "text_answer" ||
            benchmarkCase.difficulty === "descriptive"
        );
    }

    return benchmarkCase.outcomeType !== "text_answer";
}

/**
 * @param {string} agentUrl
 */
async function startAppServer(agentUrl) {
    const child = spawn("node", ["dev-server.mjs"], {
        cwd: appDir,
        env: {
            ...process.env,
            HOST: "127.0.0.1",
            VITE_AGENT_BASE_URL: agentUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
    });

    return child;
}

/**
 * @param {import("node:child_process").ChildProcess | undefined} child
 */
async function stopServer(child) {
    if (!child || child.exitCode !== null) {
        return;
    }

    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
}

/**
 * @param {string} url
 * @param {import("node:child_process").ChildProcess | undefined} child
 */
async function waitForHttpOk(url, child) {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        if (child && child.exitCode !== null) {
            throw new Error(
                `App dev server exited before becoming ready (exit code ${child.exitCode}).`
            );
        }

        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await wait(250);
    }

    throw new Error(`Timed out while waiting for ${url}`);
}

/**
 * @param {import("playwright").Page} page
 * @param {{ quietBrowserWarnings: boolean }} options
 */
function wirePageLogging(page, options) {
    page.on("console", (message) => {
        const type = message.type();
        if (
            type === "error" ||
            (type === "warning" && !options.quietBrowserWarnings)
        ) {
            console.error(`[browser:${type}] ${message.text()}`);
        }
    });
    page.on("pageerror", (error) => {
        console.error(`[browser:pageerror] ${error.message}`);
    });
}

async function loadPlaywright() {
    try {
        return await import("playwright");
    } catch {
        throw new Error(
            'The benchmark runner requires the "playwright" package to be installed.'
        );
    }
}

function createTimestamp() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * @param {string} text
 */
function summarizeText(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "";
    }

    return normalized.length > 220
        ? normalized.slice(0, 217) + "..."
        : normalized;
}

/**
 * @param {string | undefined} value
 * @param {string} flagName
 */
function requireArg(value, flagName) {
    if (!value) {
        throw new Error(`Missing value for ${flagName}.`);
    }
    return value;
}

/**
 * @param {string | undefined} value
 * @param {string} flagName
 */
function resolvePathArg(value, flagName) {
    return path.resolve(repoRoot, requireArg(value, flagName));
}

/**
 * @param {number} milliseconds
 */
function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForEnter() {
    process.stdin.resume();
    return new Promise((resolve) => {
        process.stdin.once("data", () => {
            process.stdin.pause();
            resolve();
        });
    });
}

/**
 * @param {unknown[]} left
 * @param {unknown[]} right
 */
function arraysEqual(left, right) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

/**
 * @param {number | null} actual
 * @param {"lt" | "lte" | "eq" | "gte" | "gt"} operator
 * @param {number} expected
 */
function compareNumber(actual, operator, expected) {
    if (typeof actual !== "number") {
        return false;
    }

    switch (operator) {
        case "lt":
            return actual < expected;
        case "lte":
            return actual <= expected;
        case "eq":
            return actual === expected;
        case "gte":
            return actual >= expected;
        case "gt":
            return actual > expected;
        default:
            throw new Error("Unsupported numeric operator " + operator + ".");
    }
}

/**
 * @param {unknown} left
 * @param {unknown} right
 */
function deepEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * @param {any} evidence
 * @param {any} actualState
 * @param {string} actionType
 * @param {string} attribute
 */
function hasIntentActionWithAttribute(
    evidence,
    actualState,
    actionType,
    attribute
) {
    return getRecordedIntentActions(evidence, actualState).some(
        (action) =>
            action?.type === actionType ||
            action?.actionType === actionType
                ? JSON.stringify(action)
                      .toLowerCase()
                      .includes(attribute.toLowerCase())
                : false
    );
}

/**
 * @param {any} evidence
 * @param {any} actualState
 * @returns {any[]}
 */
function getRecordedIntentActions(evidence, actualState) {
    return [
        ...(actualState.provenanceActions ?? []),
        ...evidence.toolCalls
            .filter((toolCall) => toolCall?.name === "submitIntentAction")
            .map((toolCall) => toolCall.arguments?.action),
    ];
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {unknown}
 */
function getValueAtPath(value, path) {
    const parts = path.split(".").filter(Boolean);
    let current = value;

    for (const part of parts) {
        if (current === null || typeof current !== "object") {
            return undefined;
        }

        current = /** @type {Record<string, unknown>} */ (current)[part];
    }

    return current;
}

const DEFAULT_COMPARISON_SIGNALS = [
    "higher",
    "lower",
    "more",
    "less",
    "greater",
    "smaller",
    "compared",
    "than",
    "difference",
];

/**
 * @param {string} text
 */
function extractNumbers(text) {
    return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g), (match) =>
        Number(match[0])
    ).filter((value) => Number.isFinite(value));
}

/**
 * @param {string} normalizedAnswer
 * @param {string} group
 */
function mentionsGroupWithNumber(normalizedAnswer, group) {
    const escapedGroup = escapeRegExp(group.toLowerCase());
    const numberPattern = String.raw`-?\d+(?:\.\d+)?`;
    const nearbyPattern = new RegExp(
        String.raw`${escapedGroup}[^\\n\\r:]{0,40}${numberPattern}|${numberPattern}[^\\n\\r:]{0,40}${escapedGroup}`,
        "i"
    );
    return nearbyPattern.test(normalizedAnswer);
}

/**
 * @param {string} value
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
