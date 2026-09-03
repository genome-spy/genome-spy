// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    attachControls,
    pngButton,
    svgButton,
    fullWindowButton,
    button as customButton,
} from "./controls.js";

/** @type {(() => void)[]} */
let disposers;

beforeEach(() => {
    disposers = [];
    // jsdom has dialog elements but does not implement their browser behavior.
    HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
        this.open = false;
    };
});

afterEach(() => {
    disposers.forEach((dispose) => dispose());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete HTMLDialogElement.prototype.showModal;
    delete HTMLDialogElement.prototype.close;
    document.body.replaceChildren();
    document.documentElement.removeAttribute("style");
});

/** @param {Partial<import("./controls.js").ControlsOptions>} [options] */
function setup(options = {}) {
    const container = document.createElement("div");
    container.style.position = "static";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width: 100%; height: 100%";
    const tooltip = document.createElement("div");
    container.append(canvas, tooltip);
    document.body.append(container);
    const imageExport = {
        raster: vi.fn(async () => ({ blob: new Blob(["PNG"]) })),
        svg: vi.fn(async () => ({
            blob: new Blob(["SVG"]),
            warnings: [],
            rasterized: [],
        })),
        analyzeSvg: vi.fn(),
    };
    // These controls only need imageExport; lifecycle tests check API identity.
    const api = /** @type {import("./types/embedApi.js").EmbedResult} */ (
        /** @type {unknown} */ ({ imageExport })
    );
    const controls = attachControls(container, api, {
        controls: [pngButton(), fullWindowButton()],
        ...options,
    });
    disposers.push(controls.dispose);
    /** @param {string} label */
    const button = (label) =>
        /** @type {HTMLButtonElement} */ (
            controls.element.shadowRoot.querySelector(
                `button[aria-label="${label}"]`
            )
        );
    return {
        container,
        canvas,
        tooltip,
        imageExport,
        api,
        controls,
        button,
        status: /** @type {HTMLElement} */ (
            controls.element.shadowRoot.querySelector("[role=status]")
        ),
    };
}

describe("control composition", () => {
    it("uses the label as text and permits a separate hover title", () => {
        const { button } = setup({
            controls: [
                customButton({ label: "Inspect", onClick() {} }),
                customButton({
                    label: "Clear selection",
                    title: "Clear the selected region",
                    onClick() {},
                }),
                customButton({ label: "No tooltip", title: "", onClick() {} }),
            ],
        });
        expect(button("Inspect").textContent).toBe("Inspect");
        expect(button("Inspect").title).toBe("Inspect");
        expect(button("Clear selection").textContent).toBe("Clear selection");
        expect(button("Clear selection").title).toBe(
            "Clear the selected region"
        );
        expect(button("No tooltip").title).toBe("");
    });

    it("clones decorative icons per mount without moving the supplied element", () => {
        const icon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );
        icon.setAttribute("viewBox", "0 0 20 20");
        icon.setAttribute("fill", "currentColor");
        const path = document.createElementNS(icon.namespaceURI, "path");
        path.setAttribute("d", "M0 0h20v20H0z");
        icon.append(path);
        document.body.append(icon);
        const onClick = vi.fn();
        const definition = customButton({ label: "Inspect", icon, onClick });
        const first = setup({ controls: [definition] });
        const second = setup({ controls: [definition] });
        const firstButton = first.button("Inspect");
        const firstIcon = firstButton.querySelector("svg");
        expect(icon.parentElement).toBe(document.body);
        expect(firstIcon).not.toBe(icon);
        expect(firstIcon).not.toBe(
            second.button("Inspect").querySelector("svg")
        );
        expect(firstIcon.outerHTML).toBe(icon.outerHTML);
        expect(firstIcon.parentElement.getAttribute("aria-hidden")).toBe(
            "true"
        );
        expect(firstIcon.parentElement.inert).toBe(true);
        expect(firstButton.textContent).toBe("");
        expect(firstButton.title).toBe("Inspect");
        firstButton.click();
        expect(onClick).toHaveBeenCalledOnce();
        first.controls.dispose();
        expect(icon.isConnected).toBe(true);
        expect(second.button("Inspect").querySelector("svg").isConnected).toBe(
            true
        );
    });

    it("requires an accessible name even for icon buttons", () => {
        expect(() =>
            customButton({
                label: " ",
                icon: document.createElement("span"),
                onClick() {},
            })
        ).toThrow("accessible label");
    });

    it("requires an explicit list and supports an empty panel", () => {
        const { container, api, controls } = setup({ controls: [] });
        expect(controls.element.shadowRoot.querySelector("button")).toBeNull();
        const contents = container.innerHTML;
        expect(() =>
            attachControls(
                container,
                api,
                /** @type {import("./controls.js").ControlsOptions} */ ({})
            )
        ).toThrow("explicit controls array");
        expect(container.innerHTML).toBe(contents);
    });

    it("mounts built-in and custom buttons in the supplied order", async () => {
        const onClick = vi.fn();
        const { controls, button, api } = setup({
            controls: [
                svgButton(),
                customButton({ label: "Inspect", onClick }),
                fullWindowButton(),
                pngButton(),
            ],
        });
        expect(
            Array.from(
                controls.element.shadowRoot.querySelectorAll("button"),
                (element) => element.getAttribute("aria-label")
            )
        ).toEqual(["SVG", "Inspect", "Expand to full window", "PNG"]);
        expect(button("PNG").textContent).toBe("PNG");
        expect(button("PNG").title).toBe("Download PNG");
        button("Inspect").click();
        expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ api }));
        await Promise.resolve();
        expect(button("Inspect").disabled).toBe(false);
    });

    it("mounts reusable definitions independently and aborts before cleanup", () => {
        const cleanup = vi.fn();
        const onClick = vi.fn();
        /** @type {import("./controls.js").Control} */
        const definition = {
            mount(context) {
                const element = document.createElement("button");
                element.setAttribute("aria-label", "Custom");
                element.addEventListener("click", onClick, {
                    signal: context.signal,
                });
                return {
                    element,
                    dispose() {
                        cleanup(context.signal.aborted);
                    },
                };
            },
        };
        const first = setup({ controls: [definition] });
        const second = setup({ controls: [definition] });
        expect(first.button("Custom")).not.toBe(second.button("Custom"));
        const firstButton = first.button("Custom");
        first.controls.dispose();
        first.controls.dispose();
        expect(cleanup).toHaveBeenCalledExactlyOnceWith(true);
        firstButton.click();
        expect(onClick).not.toHaveBeenCalled();
        second.button("Custom").click();
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("cleans up earlier mounts when a later mount fails", () => {
        const { container, api, controls } = setup({ controls: [] });
        controls.dispose();
        const contents = container.innerHTML;
        const cleanup = vi.fn();
        expect(() =>
            attachControls(container, api, {
                controls: [
                    {
                        mount: () => ({
                            element: document.createElement("span"),
                            dispose: cleanup,
                        }),
                    },
                    {
                        mount() {
                            throw new Error("Mount failed");
                        },
                    },
                ],
            })
        ).toThrow("Mount failed");
        expect(cleanup).toHaveBeenCalledOnce();
        expect(container.innerHTML).toBe(contents);
        expect(container.style.position).toBe("static");
    });

    it("disposes every control in reverse order even if cleanup throws", () => {
        const cleanup = vi.fn();
        const { controls, container } = setup({
            controls: [
                {
                    mount: () => ({
                        element: document.createElement("span"),
                        dispose: () => cleanup("first"),
                    }),
                },
                {
                    mount: () => ({
                        element: document.createElement("span"),
                        dispose() {
                            cleanup("second");
                            throw new Error("Cleanup failed");
                        },
                    }),
                },
            ],
        });
        expect(controls.dispose).toThrow("Unable to dispose controls");
        expect(cleanup.mock.calls).toEqual([["second"], ["first"]]);
        expect(controls.element.isConnected).toBe(false);
        expect(container.style.position).toBe("static");
    });

    it.each([false, true])(
        "reports custom action failures (async: %s) and permits retry",
        async (asynchronous) => {
            const error = new Error("Action failed");
            const onError = vi.fn();
            const onClick = vi.fn(
                /** @returns {void | Promise<void>} */ () => {
                    if (asynchronous) return Promise.reject(error);
                    throw error;
                }
            );
            const { button, status } = setup({
                onError,
                controls: [customButton({ label: "Run", onClick })],
            });
            button("Run").click();
            await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
            expect(status.textContent).toContain("Action failed");
            expect(button("Run").disabled).toBe(false);
            onClick.mockImplementation(() => {});
            button("Run").click();
            expect(onClick).toHaveBeenCalledTimes(2);
            expect(status.hidden).toBe(true);
        }
    );

    it("disables a pending custom action and suppresses its error after disposal", async () => {
        /** @type {(error: Error) => void} */
        let reject;
        const onClick = vi.fn(
            () =>
                new Promise((_, fail) => {
                    reject = fail;
                })
        );
        const onError = vi.fn();
        const { button, controls } = setup({
            onError,
            controls: [customButton({ label: "Run", onClick })],
        });
        const run = button("Run");
        run.click();
        expect(run.disabled).toBe(true);
        run.click();
        expect(onClick).toHaveBeenCalledOnce();
        controls.dispose();
        reject(new Error("Too late"));
        await Promise.resolve();
        expect(onError).not.toHaveBeenCalled();
    });
});

describe("image controls", () => {
    it("mounts only the requested controls", () => {
        const { button } = setup();
        expect(button("PNG")).not.toBeNull();
        expect(button("SVG")).toBeNull();
        expect(button("Expand to full window")).not.toBeNull();
        const onlySvg = setup({ controls: [svgButton()] });
        expect(onlySvg.button("PNG")).toBeNull();
        expect(onlySvg.button("SVG")).not.toBeNull();
        expect(onlySvg.button("Expand to full window")).toBeNull();
    });

    it("downloads the requested format and presents SVG warnings", async () => {
        vi.useFakeTimers();
        const createObjectURL = vi.fn(
            (/** @type {Blob} */ blob) => "blob:export"
        );
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
        /** @type {{filename: string, href: string}[]} */
        const downloads = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
            function () {
                downloads.push({ filename: this.download, href: this.href });
            }
        );
        const { imageExport, button, status } = setup({
            controls: [
                pngButton({
                    filename: "my-plot",
                    exportOptions: { pixelRatio: 3 },
                }),
                svgButton({
                    filename: "vector-plot",
                    exportOptions: { background: null },
                }),
            ],
        });
        imageExport.svg.mockResolvedValue({
            blob: new Blob(["SVG"]),
            warnings: ["An effect was omitted."],
            rasterized: [],
        });
        button("PNG").click();
        await Promise.resolve();
        expect(downloads).toHaveLength(1);
        expect(imageExport.raster).toHaveBeenCalledWith({ pixelRatio: 3 });
        button("SVG").click();
        await Promise.resolve();
        expect(downloads).toHaveLength(2);
        expect(imageExport.svg).toHaveBeenCalledWith({ background: null });
        expect(downloads.map((d) => d.filename)).toEqual([
            "my-plot.png",
            "vector-plot.svg",
        ]);
        expect(createObjectURL.mock.calls[1][0]).toBe(
            (await imageExport.svg.mock.results[0].value).blob
        );
        expect(status.textContent).toContain("An effect was omitted.");
        expect(status.hidden).toBe(false);
        expect(document.querySelector("a[download]")).toBeNull();
        await vi.advanceTimersByTimeAsync(1000);
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it("reports failures and permits retrying", async () => {
        const onError = vi.fn();
        const { imageExport, button, status } = setup({ onError });
        const error = new Error("Renderer unavailable");
        imageExport.raster.mockRejectedValue(error);
        button("PNG").click();
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
        expect(status.textContent).toContain("Renderer unavailable");
        expect(button("PNG").disabled).toBe(false);
    });

    it("prevents overlapping exports and ignores completion after disposal", async () => {
        const { imageExport, controls, button } = setup({
            controls: [pngButton(), svgButton()],
        });
        /** @type {(result: {blob: Blob}) => void} */
        let finish;
        imageExport.raster.mockReturnValue(
            new Promise((resolve) => (finish = resolve))
        );
        const createObjectURL = vi.fn();
        vi.stubGlobal("URL", { createObjectURL });
        button("PNG").click();
        expect(button("PNG").disabled).toBe(true);
        expect(button("SVG").disabled).toBe(true);
        button("SVG").click();
        expect(imageExport.svg).not.toHaveBeenCalled();
        controls.dispose();
        finish({ blob: new Blob() });
        await Promise.resolve();
        expect(createObjectURL).not.toHaveBeenCalled();
        expect(controls.element.isConnected).toBe(false);
    });
});

describe("controls placement", () => {
    it.each(/** @type {const} */ (["inside", "top", "bottom"]))(
        "attaches %s controls directly without changing existing content or sizing",
        (placement) => {
            const { container, canvas, tooltip, controls, button } = setup({
                placement,
            });
            expect(Array.from(container.children)).toEqual([
                canvas,
                tooltip,
                controls.element,
            ]);
            expect(container.style.cssText).toBe(
                "position: relative !important;"
            );
            expect(canvas.style.cssText).toBe("width: 100%; height: 100%;");
            expect(tooltip.style.cssText).toBe("");
            expect(controls.element.dataset.visibility).toBe(
                placement == "inside" ? "hover" : "always"
            );

            // Outside controls move inside while expanded, then return to their placement.
            button("Expand to full window").click();
            expect(controls.element.dataset.placement).toBe("inside");
            button("Restore visualization size").click();
            expect(controls.element.dataset.placement).toBe(placement);
            controls.dispose();
            expect(Array.from(container.children)).toEqual([canvas, tooltip]);
            expect(container.style.cssText).toBe("position: static;");
            expect(canvas.style.cssText).toBe("width: 100%; height: 100%;");
        }
    );

    it("uses hover visibility inside and allows explicit overrides outside", () => {
        expect(setup().controls.element.dataset.placement).toBe("inside");
        expect(setup().controls.element.dataset.visibility).toBe("hover");
        expect(
            setup({ placement: "bottom", visibility: "hover" }).controls.element
                .dataset.visibility
        ).toBe("hover");
    });
});

describe("full-window controls", () => {
    it("reveals controls when hover settles after reparenting into the dialog", async () => {
        vi.useFakeTimers();
        const { container, controls, button } = setup();
        const matches = vi.spyOn(container, "matches").mockReturnValue(false);
        button("Expand to full window").click();

        // Browsers can dispatch pointerenter before updating :hover, even
        // after the event's microtasks have run. No further pointer event follows.
        container.dispatchEvent(new Event("pointerenter"));
        await Promise.resolve();
        matches.mockReturnValue(true);
        vi.advanceTimersToNextFrame();
        expect(controls.element.hasAttribute("data-container-active")).toBe(
            true
        );

        matches.mockReturnValue(false);
        container.dispatchEvent(new Event("pointerleave"));
        vi.advanceTimersToNextFrame();
        expect(controls.element.hasAttribute("data-container-active")).toBe(
            false
        );
    });

    it("rejects document roots before changing the DOM", () => {
        const { api } = setup();
        const originalChildren = Array.from(document.body.childNodes);
        expect(() =>
            attachControls(document.body, api, {
                controls: [fullWindowButton()],
            })
        ).toThrow("dedicated visualization container");
        expect(() =>
            attachControls(document.documentElement, api, {
                controls: [fullWindowButton()],
            })
        ).toThrow("dedicated visualization container");
        expect(Array.from(document.body.childNodes)).toEqual(originalChildren);
    });

    it("preserves the live container and restores placement, styles, and focus on Escape", () => {
        const { container, controls, button } = setup();
        container.style.setProperty("width", "420px", "important");
        container.style.marginLeft = "17px";
        document.documentElement.style.overflowY = "scroll";
        document.documentElement.scrollTop = 500;
        const next = document.createElement("p");
        container.after(next);
        const input = document.createElement("input");
        input.value = "live state";
        container.prepend(input);
        const expand = button("Expand to full window");
        expand.click();
        const dialog = document.querySelector("dialog");
        expect(dialog.open).toBe(true);
        expect(dialog.contains(container)).toBe(true);
        expect(container.querySelector("input")).toBe(input);
        expect(container.style.width).toBe("100%");
        expect(expand.getAttribute("aria-pressed")).toBe("true");
        // Simulate the offset being clamped while its content is in the dialog.
        document.documentElement.scrollTop = 140;
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        expect(container.nextSibling).toBe(next);
        expect(container.style.width).toBe("420px");
        expect(container.style.getPropertyPriority("width")).toBe("important");
        expect(container.style.marginLeft).toBe("17px");
        expect(container.style.marginTop).toBe("");
        expect(document.documentElement.style.overflowY).toBe("scroll");
        expect(document.documentElement.scrollTop).toBe(500);
        expect(document.querySelector("dialog")).toBeNull();
        expect(controls.element.shadowRoot.activeElement).toBe(expand);
        expect(input.value).toBe("live state");
    });

    it("restores an expanded container on disposal without affecting another embed", () => {
        const first = setup();
        const second = setup();
        first.button("Expand to full window").click();
        first.controls.dispose();
        first.controls.dispose();
        expect(first.container.parentElement).toBe(document.body);
        expect(first.container.style.position).toBe("static");
        expect(first.container.style.width).toBe("");
        expect(second.controls.element.isConnected).toBe(true);
        second.button("Expand to full window").click();
        expect(
            document.querySelector("dialog").contains(second.container)
        ).toBe(true);
        second.button("Restore visualization size").click();
        expect(document.querySelector("dialog")).toBeNull();
    });
});
