import { expect, test, vi } from "vitest";

import UnitView from "../../../view/unitView.js";
import { create } from "../../../view/testUtils.js";
import WebGLTextMark from "./text.js";

test("updates a vector uniform from an expression component", async () => {
    const view = await create(
        {
            params: [{ name: "fadeDistance", value: 4 }],
            data: { values: [{ label: "text" }] },
            mark: "text",
            encoding: { text: { field: "label", type: "nominal" } },
        },
        UnitView
    );
    const textMark = /** @type {any} */ (
        Object.create(WebGLTextMark.prototype)
    );
    textMark.mark = { unitView: view };
    const uniformSetter = vi.fn();
    textMark.markUniformInfo = {
        setters: { uTestVector: uniformSetter },
    };
    const requestRender = vi.spyOn(view.context.animator, "requestRender");

    textMark.registerMarkUniformVector("uTestVector", [
        1,
        { expr: "fadeDistance" },
        3,
        4,
    ]);
    expect(uniformSetter).toHaveBeenLastCalledWith([1, 4, 3, 4]);

    view.paramRuntime.setValue("fadeDistance", 12);

    expect(uniformSetter).toHaveBeenLastCalledWith([1, 12, 3, 4]);
    expect(requestRender).toHaveBeenCalledTimes(2);
});
