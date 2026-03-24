// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import GenomeSpy from "./main.js";

const { embedMock } = vi.hoisted(() => ({
    embedMock: vi.fn(),
}));

vi.mock("@genome-spy/core/index.js", () => ({
    embed: embedMock,
}));

afterEach(() => {
    embedMock.mockReset();
    document.body.innerHTML = "";
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
