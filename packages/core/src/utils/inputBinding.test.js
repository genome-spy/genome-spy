// @vitest-environment jsdom

import { render } from "lit";
import { expect, onTestFinished, test } from "vitest";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import createBindingInputs from "./inputBinding.js";

function createRuntime() {
    const runtime = new ViewParamRuntime();
    onTestFinished(() => runtime.dispose());
    return runtime;
}

test("keeps same-named radio bindings independent in the same document", () => {
    const first = createRuntime();
    const second = createRuntime();
    for (const runtime of [first, second]) {
        runtime.registerParam({
            name: "mode",
            value: "A",
            bind: { input: "radio", options: ["A", "B"] },
        });
    }

    const container = document.body.appendChild(document.createElement("div"));
    onTestFinished(() => container.remove());
    render(
        [...createBindingInputs(first), ...createBindingInputs(second)],
        container
    );

    const [firstA, firstB, secondA] = container.querySelectorAll("input");
    firstB.click();

    expect(firstB.checked).toBe(true);
    expect(firstA.checked).toBe(false);
    expect(secondA.checked).toBe(true);
    expect(first.getValue("mode")).toBe("B");
    expect(second.getValue("mode")).toBe("A");
});

test("associates parameter labels and help text with the rendered controls", () => {
    const runtime = createRuntime();
    runtime.registerParam({
        name: "mode",
        value: "A",
        bind: {
            input: "radio",
            name: "Display mode",
            options: ["A", "B"],
            labels: ["Summary", "Details"],
            description: "Choose how much data to display.",
        },
    });
    runtime.registerParam({
        name: "query",
        value: "",
        bind: { input: "text", description: "Enter a gene name." },
    });
    runtime.registerParam({
        name: "highlight",
        value: true,
        bind: { input: "checkbox" },
    });

    const container = document.createElement("div");
    render(createBindingInputs(runtime), container);

    const group = container.querySelector('[role="radiogroup"]');
    const query = container.querySelector('input[type="text"]');
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(
        container.querySelector("#" + group.getAttribute("aria-labelledby"))
            .textContent
    ).toBe("Display mode");
    expect(group.querySelector("input").labels[0].textContent.trim()).toBe(
        "Summary"
    );
    expect(
        container
            .querySelector("#" + group.getAttribute("aria-describedby"))
            .textContent.trim()
    ).toBe("Choose how much data to display.");
    expect(
        container
            .querySelector("#" + query.getAttribute("aria-describedby"))
            .textContent.trim()
    ).toBe("Enter a gene name.");
    expect(checkbox.hasAttribute("aria-describedby")).toBe(false);
});
