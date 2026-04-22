// @ts-nocheck
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const benchmarkDir = path.resolve(scriptDir);
const repoRoot = path.resolve(benchmarkDir, "..", "..", "..", "..", "..");
const appDir = path.join(repoRoot, "packages", "app");

const defaultCaseFile = path.join(benchmarkDir, "cases", "copy-numbers.json");
const defaultAppUrl = "http://127.0.0.1:8080";
const defaultAgentUrl = "http://127.0.0.1:8000";
const defaultTimeoutMs = 90_000;

const helpText = `Usage:
  node packages/app-agent/src/agent/benchmarks/run.mjs [options]

Options:
  --case-file PATH     Benchmark case file. Default: packages/app-agent/src/agent/benchmarks/cases/copy-numbers.json
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
                console.log(`Running ${benchmarkCase.id}`);
                const result = await runCase(page, appUrl, benchmarkCase, {
                    defaultSetup: suite.setup ?? {},
                    outputDir,
                    timeoutMs: options.timeoutMs,
                    interactive: options.interactive,
                    screenshots: options.screenshots,
                    agentModuleBaseUrl,
                });
                results.push(result);
                printCaseResult(result);
            }

            const suiteResult = summarizeSuite(results);
            const suiteOutputPath = path.join(outputDir, "suite-result.json");
            fs.writeFileSync(
                suiteOutputPath,
                JSON.stringify(
                    {
                        suite: suite.visualizationId ?? path.basename(options.caseFile),
                        caseFile: path.relative(repoRoot, options.caseFile),
                        generatedAt: new Date().toISOString(),
                        results,
                        summary: suiteResult,
                    },
                    null,
                    2
                )
            );

            console.log(`Wrote ${path.relative(repoRoot, suiteOutputPath)}`);

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
 * }} options
 */
async function runCase(page, appUrl, benchmarkCase, options) {
    const startedAt = Date.now();
    const caseDir = path.join(
        options.outputDir,
        benchmarkCase.id.replaceAll("/", "_")
    );
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
    await resetCaseState(page, options.timeoutMs);

    const beforePath = path.join(caseDir, "before.png");
    if (options.screenshots) {
        await page.screenshot({ path: beforePath });
    }

    const execution = await page.evaluate(
        async ({ prompt, timeoutMs }) => {
            const benchmarkGlobal = /** @type {any} */ (globalThis);
            const controller = benchmarkGlobal.__gsAgentBenchmark?.controller;
            if (!controller) {
                throw new Error("Benchmark controller was not initialized.");
            }

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(
                        new Error(
                            "Benchmark case timed out while waiting for the agent turn."
                        )
                    );
                }, timeoutMs);
            });

            await Promise.race([controller.sendMessage(prompt), timeoutPromise]);
            return controller.getSnapshot();
        },
        {
            prompt: benchmarkCase.prompt,
            timeoutMs: options.timeoutMs,
        }
    );

    const afterPath = path.join(caseDir, "after.png");
    if (options.screenshots) {
        await page.screenshot({ path: afterPath });
    }

    const actualState = await page.evaluate(
        async ({ expectedState, agentModuleBaseUrl }) => {
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
                viewVisibility:
                    expectedState?.viewVisibility?.map((entry) => {
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
        },
        {
            expectedState: benchmarkCase.oracle?.expectedState ?? null,
            agentModuleBaseUrl: options.agentModuleBaseUrl,
        }
    );

    const evidence = buildEvidence(execution);
    const evaluation = evaluateCase(benchmarkCase, actualState, evidence);
    const metrics = buildMetrics(execution, benchmarkCase.oracle);
    const result = {
        caseId: benchmarkCase.id,
        prompt: benchmarkCase.prompt,
        status: evaluation.status,
        checks: evaluation.checks,
        metrics: {
            ...metrics,
            durationMs: Date.now() - startedAt,
        },
        evidence: {
            finalAnswer: evidence.finalAnswer,
            messages: evidence.messages,
            appState: actualState,
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

    return result;
}

/**
 * @param {import("playwright").Page} page
 * @param {URL} caseUrl
 * @param {{
 *     timeoutMs: number;
 *     interactive: boolean;
 *     agentModuleBaseUrl: string;
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
            options.agentModuleBaseUrl
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
    agentModuleBaseUrl
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

    await waitForPreflight(page, timeoutMs);
}

/**
 * Restore the visualization and agent session before every case while keeping
 * the already-loaded data and browser page alive.
 *
 * @param {import("playwright").Page} page
 * @param {number} timeoutMs
 */
async function resetCaseState(page, timeoutMs) {
    await page.evaluate(async () => {
        const benchmarkGlobal = /** @type {any} */ (globalThis);
        const benchmarkState = benchmarkGlobal.__gsAgentBenchmark;
        if (!benchmarkState?.app || !benchmarkState?.controller) {
            throw new Error("Benchmark session was not initialized.");
        }

        const { resetToDefaultState } = await import(
            new URL("/bookmark/bookmark.js", globalThis.location.href).toString()
        );

        resetToDefaultState(benchmarkState.app);
        await benchmarkState.app.paramProvenanceBridge?.whenApplied?.();

        benchmarkState.controller.reset();
        await benchmarkState.controller.open();
    });

    await waitForPreflight(page, timeoutMs);
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

    const preflightState = await page.evaluate(
        () => {
            const benchmarkGlobal = /** @type {any} */ (globalThis);
            return benchmarkGlobal.__gsAgentBenchmark.controller.getSnapshot();
        }
    );
    if (preflightState.preflightState !== "ready") {
        throw new Error(
            "Agent preflight failed: " + (preflightState.lastError || "unknown")
        );
    }
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
function buildEvidence(snapshot) {
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
                    message.kind === "clarification" ||
                    message.kind === "error"
            )?.text ?? "";

    return {
        finalAnswer,
        messages,
    };
}

/**
 * @param {any} snapshot
 * @param {any} oracle
 */
function buildMetrics(snapshot, oracle = {}) {
    const messages = snapshot.messages ?? [];
    const toolCallCount = messages
        .filter((message) => message.kind === "tool_call")
        .reduce(
            (count, message) => count + (message.toolCalls?.length ?? 0),
            0
        );
    const rejectedToolCallCount = messages.filter(
        (message) =>
            message.kind === "tool_result" &&
            typeof message.text === "string" &&
            message.text.startsWith("Tool call was incorrect and rejected.")
    ).length;
    const intentActionCount = messages
        .filter(
            (message) =>
                message.kind === "tool_result" &&
                message.content?.kind === "intent_batch_result"
        )
        .reduce(
            (count, message) =>
                count + (message.content?.batch?.steps?.length ?? 0),
            0
        );
    const triesToSuccess = messages.filter(
        (message) =>
            message.kind === "tool_call" ||
            message.kind === "assistant" ||
            message.kind === "clarification"
    ).length;

    return {
        triesToSuccess,
        toolCallCount,
        intentActionCount,
        rejectedToolCallCount,
        efficiencyGap: Math.max(
            0,
            intentActionCount - (oracle?.minIntentActions ?? 0)
        ),
    };
}

/**
 * @param {any} benchmarkCase
 * @param {any} actualState
 * @param {{ finalAnswer: string }} evidence
 */
function evaluateCase(benchmarkCase, actualState, evidence) {
    /** @type {Array<{ name: string; ok: boolean; detail?: string }>} */
    const checks = [];
    const expectedState = benchmarkCase.oracle?.expectedState;
    if (expectedState) {
        if (expectedState.groupByAttributes) {
            checks.push({
                name: "groupByAttributes",
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
                name: "sortByAttribute",
                ok: actualState.sortByAttribute === expectedState.sortByAttribute,
                detail: `expected ${expectedState.sortByAttribute}, got ${actualState.sortByAttribute}`,
            });
        }

        if (expectedState.visibleSampleCount) {
            checks.push({
                name: "visibleSampleCount",
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
                    name: `metadataAttributesPresent:${attributeName}`,
                    ok: actualState.metadataAttributesPresent.includes(
                        attributeName
                    ),
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
                    name: `viewVisibility:${JSON.stringify(
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
    }

    const expectedAnswer = benchmarkCase.oracle?.expectedAnswer;
    if (expectedAnswer) {
        const normalizedAnswer = evidence.finalAnswer.toLowerCase();

        if (expectedAnswer.mustContainAny?.length) {
            checks.push({
                name: "mustContainAny",
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
                    name: `mustContainAll:${term}`,
                    ok: normalizedAnswer.includes(String(term).toLowerCase()),
                    detail: `missing ${term}`,
                });
            }
        }

        if (expectedAnswer.mustNotContain?.length) {
            for (const term of expectedAnswer.mustNotContain) {
                checks.push({
                    name: `mustNotContain:${term}`,
                    ok: !normalizedAnswer.includes(String(term).toLowerCase()),
                    detail: `answer contained forbidden term ${term}`,
                });
            }
        }

        if (expectedAnswer.factSlots) {
            const factSlots = /** @type {Record<string, string>} */ (
                expectedAnswer.factSlots
            );
            for (const [slot, expectedValue] of Object.entries(factSlots)) {
                checks.push({
                    name: `factSlots:${slot}`,
                    ok: normalizedAnswer.includes(
                        String(expectedValue).toLowerCase()
                    ),
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
                    name: `numericSlots:${slot}`,
                    ok,
                    detail: `expected ${expected.value} +/- ${tolerance}, got ${JSON.stringify(
                        numbers
                    )}`,
                });
            }
        }
    }

    const failedChecks = checks.filter((check) => !check.ok);
    return {
        status: failedChecks.length === 0 ? "passed" : "failed",
        checks,
    };
}

/**
 * @param {any[]} results
 */
function summarizeSuite(results) {
    const summary = {
        passed: 0,
        failed: 0,
        errored: 0,
        averageDurationMs: 0,
        averageTriesToSuccess: 0,
    };

    for (const result of results) {
        if (result.status === "passed") {
            summary.passed += 1;
        } else if (result.status === "failed") {
            summary.failed += 1;
        } else {
            summary.errored += 1;
        }
    }

    if (results.length > 0) {
        summary.averageDurationMs =
            Math.round(
                (results.reduce(
                    (sum, result) => sum + result.metrics.durationMs,
                    0
                ) /
                    results.length) *
                    10
            ) / 10;
        summary.averageTriesToSuccess =
            Math.round(
                (results.reduce(
                    (sum, result) => sum + result.metrics.triesToSuccess,
                    0
                ) /
                    results.length) *
                    10
            ) / 10;
    }

    return summary;
}

/**
 * @param {any} result
 */
function printCaseResult(result) {
    console.log(`Prompt: ${result.prompt}`);
    console.log(
        `Result: ${result.status} | ${result.metrics.durationMs} ms | tries ${result.metrics.triesToSuccess} | tool calls ${result.metrics.toolCallCount} | intent actions ${result.metrics.intentActionCount}`
    );

    const summaryText = summarizeText(result.evidence.finalAnswer);
    if (summaryText) {
        console.log(`Answer: ${summaryText}`);
    }

    const failedChecks = result.checks.filter((check) => !check.ok);
    if (failedChecks.length > 0) {
        for (const check of failedChecks) {
            console.log(`Failed check: ${check.name} - ${check.detail ?? ""}`);
        }
    }

    console.log("");
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
 * @param {string} text
 */
function extractNumbers(text) {
    return Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g), (match) =>
        Number(match[0])
    ).filter((value) => Number.isFinite(value));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
