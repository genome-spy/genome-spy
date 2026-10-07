// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import GenomeSpy from "./main.js";
import CoreGenomeSpy from "@genome-spy/core/genomeSpy.js";
import { createEmbed } from "@genome-spy/core/embedFactory.js";

const { embedMock } = vi.hoisted(() => ({
    embedMock: vi.fn(),
}));

vi.mock("@genome-spy/core/index.js", () => ({
    embed: embedMock,
}));

// jsdom cannot parse scoped CSS; these assertions cover the rendered error content.
vi.mock("@genome-spy/core/styles/genome-spy.css.js", () => ({ default: "" }));

afterEach(() => {
    embedMock.mockReset();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

test("shows a failed embed error only once", async () => {
    const error = new Error("Invalid visualization");
    const onEmbed = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(CoreGenomeSpy.prototype, "launch").mockImplementation(
        async function () {
            // Use the real embed failure handler and cleanup without starting a renderer.
            this.options.onError(error, this.container);
            return false;
        }
    );
    embedMock.mockImplementation(createEmbed(CoreGenomeSpy));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            createElement(GenomeSpy, { spec: { mark: "point" }, onEmbed })
        );
    });

    expect(container.querySelectorAll(".message-box")).toHaveLength(1);
    expect(container.querySelector(".message-box").textContent).toBe(
        String(error)
    );
    expect(container.querySelector("pre")).toBeNull();
    expect(onEmbed).not.toHaveBeenCalled();

    await act(async () => root.unmount());
});

test("shows onEmbed errors and still finalizes on unmount", async () => {
    const error = new Error("Host setup failed");
    const finalize = vi.fn();
    embedMock.mockResolvedValue({ finalize });
    const onEmbed = () => {
        throw error;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            createElement(GenomeSpy, { spec: { mark: "point" }, onEmbed })
        );
    });

    expect(container.querySelector("pre").textContent).toBe(String(error));

    await act(async () => root.unmount());
    expect(finalize).toHaveBeenCalledOnce();
});

test("embeds into the rendered container and finalizes on unmount", async () => {
    const finalize = vi.fn();
    const onEmbed = vi.fn();
    const spec = { mark: "point" };
    const container = document.createElement("div");

    document.body.appendChild(container);
    // The component should pass the rendered div to embed() and clean it up on unmount.
    embedMock.mockResolvedValue({ finalize });

    const root = createRoot(container);

    await act(async () => {
        root.render(createElement(GenomeSpy, { spec, onEmbed }));
    });

    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedMock.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    expect(embedMock.mock.calls[0][1]).toBe(spec);
    expect(onEmbed).toHaveBeenCalledWith({ finalize });

    await act(async () => {
        root.unmount();
    });

    expect(finalize).toHaveBeenCalledTimes(1);
});
