// @ts-nocheck
import { vi } from "vitest";

/**
 * @param {Array<{
 *   kind: "metadata",
 *   name: string,
 *   dataType: "nominal" | "quantitative",
 *   visible?: boolean,
 * }>} metadataAttributes
 * @param {Array<{
 *   view: string,
 *   title: string,
 *   field: string,
 *   dataType: "nominal" | "quantitative",
 * }>} intervalFields
 * @param {boolean} hasActiveSelection
 */
export function createVisualizationFixture({
    metadataAttributes = [
        { name: "groupLabel", dataType: "nominal", visible: true },
        { name: "scoreValue", dataType: "quantitative", visible: true },
    ],
    intervalFields = [
        {
            view: "signalTrack",
            title: "Signal Track",
            field: "signalValue",
            dataType: "quantitative",
        },
    ],
    hasActiveSelection = true,
} = {}) {
    return {
        metadataAttributes,
        intervalFields,
        hasActiveSelection,
    };
}

/**
 * @param {{
 *   fixture?: ReturnType<typeof createVisualizationFixture>,
 *   brushValue?: [number, number],
 * }} [options]
 */
export function createAgentBrowserApp(options = {}) {
    const fixture = options.fixture ?? createVisualizationFixture();
    const brushValue = options.brushValue ?? [0, 1];

    const groupedFields = Array.from(
        fixture.intervalFields.reduce((groups, fieldInfo) => {
            const key = JSON.stringify([fieldInfo.view, fieldInfo.title]);
            const current = groups.get(key) ?? [];
            current.push(fieldInfo);
            groups.set(key, current);
            return groups;
        }, new Map())
    );

    const channels = ["y", "color", "size", "opacity", "strokeWidth"];
    const views = groupedFields.map(([, fieldInfos]) => ({
        explicitName: fieldInfos[0].view,
        getTitleText: () => fieldInfos[0].title,
        getEncoding: () => {
            /** @type {Record<string, { field: string, type: string }>} */
            const encoding = {
                x: { field: "position", type: "locus" },
            };

            for (const [index, fieldInfo] of fieldInfos.entries()) {
                const channel = channels[index] ?? `detail${index}`;
                encoding[channel] = {
                    field: fieldInfo.field,
                    type: fieldInfo.dataType,
                };
            }

            return encoding;
        },
    }));

    /** @type {Record<string, { visible?: boolean }>} */
    const attributeDefs = {};
    for (const attribute of fixture.metadataAttributes) {
        attributeDefs[attribute.name] = {
            visible: attribute.visible ?? true,
        };
    }

    const sampleView = {
        __resolvedParamView: views[0],
        name: "sampleView",
        sampleHierarchy: {
            sampleData: {
                ids: ["sampleA", "sampleB"],
                entities: {
                    sampleA: { id: "sampleA" },
                    sampleB: { id: "sampleB" },
                },
            },
            sampleMetadata: {
                attributeNames: fixture.metadataAttributes.map(
                    (attribute) => attribute.name
                ),
                attributeDefs,
            },
            groupMetadata: [],
            rootGroup: {
                name: "ROOT",
                samples: ["sampleA", "sampleB"],
                groups: [{ name: "group", samples: ["sampleA", "sampleB"] }],
            },
        },
        getTitleText: () => "Capability Fixture",
        visit: (visitor) => {
            for (const view of views) {
                visitor(view);
            }
        },
        actions: {
            deriveMetadata: (payload) => ({
                type: "sampleView/deriveMetadata",
                payload,
            }),
        },
        compositeAttributeInfoSource: {
            getAttributeInfo: (attribute) => {
                if (attribute.type === "SAMPLE_ATTRIBUTE") {
                    const match = fixture.metadataAttributes.find(
                        (entry) => entry.name === attribute.specifier
                    );
                    const dataType = match?.dataType ?? "nominal";
                    return {
                        name: String(attribute.specifier),
                        attribute,
                        title: String(attribute.specifier),
                        emphasizedName: String(attribute.specifier),
                        accessor: () => undefined,
                        valuesProvider: () => [],
                        type: dataType,
                    };
                }

                if (attribute.type === "VALUE_AT_LOCUS") {
                    return {
                        name: String(attribute.specifier?.field ?? "viewField"),
                        attribute,
                        title: String(
                            attribute.specifier?.field ?? "viewField"
                        ),
                        emphasizedName: String(
                            attribute.specifier?.field ?? "viewField"
                        ),
                        accessor: () => undefined,
                        valuesProvider: () => [],
                        type: "quantitative",
                    };
                }

                throw new Error(
                    "Unknown attribute " + JSON.stringify(attribute) + "."
                );
            },
        },
    };

    return {
        options: {},
        store: {
            getState: () => ({
                lifecycle: {
                    appInitialized: true,
                },
            }),
        },
        getSampleView: () => sampleView,
        intentPipeline: {
            submit: vi.fn(() => Promise.resolve()),
        },
        provenance: {
            getPresentState: () => ({
                sampleView: {
                    sampleData: sampleView.sampleHierarchy.sampleData,
                    sampleMetadata: sampleView.sampleHierarchy.sampleMetadata,
                    rootGroup: sampleView.sampleHierarchy.rootGroup,
                },
                paramProvenance: {
                    entries: fixture.hasActiveSelection
                        ? {
                              brush: {
                                  selector: { scope: [], param: "brush" },
                                  value: {
                                      type: "interval",
                                      value: brushValue,
                                  },
                              },
                          }
                        : {},
                },
            }),
            getBookmarkableActionHistory: () => [],
            getActionInfo: () => undefined,
        },
    };
}

/**
 * @param {Array<Record<string, any>>} responses
 */
export function installPlannerMock(responses) {
    /** @type {any[]} */
    const requests = [];
    let index = 0;

    globalThis.fetch = vi.fn(async (url, init) => {
        requests.push({
            url,
            init,
            body: JSON.parse(String(init?.body ?? "{}")),
        });

        const response = responses[index];
        index += 1;

        return {
            ok: true,
            headers: {
                get: () => null,
            },
            json: async () => response,
        };
    });

    return {
        requests,
        fetchMock: /** @type {ReturnType<typeof vi.fn>} */ (globalThis.fetch),
    };
}

export function installDialogTestEnvironment() {
    if (!globalThis.requestAnimationFrame) {
        globalThis.requestAnimationFrame = (callback) =>
            setTimeout(() => callback(Date.now()), 0);
    }

    if (!HTMLDialogElement.prototype.showModal) {
        HTMLDialogElement.prototype.showModal = function showModal() {
            this.open = true;
        };
    }

    if (!HTMLDialogElement.prototype.show) {
        HTMLDialogElement.prototype.show = function show() {
            this.open = true;
        };
    }

    if (!HTMLDialogElement.prototype.close) {
        HTMLDialogElement.prototype.close = function close() {
            this.open = false;
        };
    }

    if (!HTMLDialogElement.prototype.requestClose) {
        HTMLDialogElement.prototype.requestClose = function requestClose() {
            this.dispatchEvent(new Event("cancel", { cancelable: true }));
        };
    }
}

/**
 * @param {string} tagName
 * @returns {Promise<HTMLElement>}
 */
export async function waitForDialog(tagName) {
    for (let i = 0; i < 20; i += 1) {
        const element = document.body.querySelector(tagName);
        if (element) {
            await flushPromises();
            return /** @type {HTMLElement} */ (element);
        }

        await flushPromises();
    }

    throw new Error("Dialog " + tagName + " was not rendered.");
}

/**
 * @param {HTMLElement} dialogElement
 * @param {string} label
 */
export async function clickDialogButton(dialogElement, label) {
    const button = Array.from(
        dialogElement.shadowRoot?.querySelectorAll("button") ?? []
    ).find((element) => element.textContent?.trim() === label);
    if (!button) {
        throw new Error("Dialog button " + label + " was not found.");
    }

    button.click();
    await flushPromises();

    const dialog = dialogElement.shadowRoot?.querySelector("dialog");
    dialog?.dispatchEvent(new Event("transitionend"));
    await flushPromises();
}

/**
 * @param {HTMLElement} dialogElement
 * @param {string} value
 */
export async function setDialogSelectValue(dialogElement, value) {
    const select = /** @type {HTMLSelectElement | null} */ (
        dialogElement.shadowRoot?.querySelector("select")
    );
    if (!select) {
        throw new Error("Dialog select was not found.");
    }

    select.value = value;
    select.dispatchEvent(new Event("change"));
    await flushPromises();
}

/**
 * @param {HTMLElement} dialogElement
 */
export function getDialogText(dialogElement) {
    return dialogElement.shadowRoot?.textContent ?? "";
}

export async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}
