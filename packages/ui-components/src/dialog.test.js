// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import BaseDialog, { showDialogWithElement } from "./dialog.js";

class TestDialog extends BaseDialog {
    complete() {
        this.finish({ ok: true });
        this.triggerClose();
    }
}

customElements.define("gs-test-dialog", TestDialog);

afterEach(() => {
    document.body.replaceChildren();
});

test("a dialog can reference an accessible description", async () => {
    const { element } = showDialogWithElement("gs-test-dialog", makeNonOpening);
    await element.updateComplete;
    const dialog = element.shadowRoot.querySelector("dialog");
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);

    element.dialogDescribedBy = "help-summary help-instructions";
    await element.updateComplete;
    expect(dialog.getAttribute("aria-describedby")).toBe(
        "help-summary help-instructions"
    );

    element.dialogDescribedBy = null;
    await element.updateComplete;
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
});

test("a nested dialog only settles and removes its own instance", async () => {
    const mount = document.createElement("section");
    document.body.append(mount);

    const outer = showDialogWithElement("gs-test-dialog", makeNonOpening, {
        mount,
    });
    expect(outer.element.parentElement).toBe(mount);
    await outer.element.updateComplete;

    const inner = showDialogWithElement("gs-test-dialog", makeNonOpening, {
        mount: /** @type {ShadowRoot} */ (outer.element.shadowRoot),
    });
    await inner.element.updateComplete;

    const outerDone = vi.fn();
    void outer.promise.then(outerDone);
    finishAndClose(inner.element);
    await expect(inner.promise).resolves.toEqual({ ok: true });
    expect(inner.element.isConnected).toBe(false);
    expect(outer.element.isConnected).toBe(true);
    expect(outerDone).not.toHaveBeenCalled();

    finishAndClose(outer.element);
    await expect(outer.promise).resolves.toEqual({ ok: true });
    expect(outer.element.isConnected).toBe(false);
});

/** @param {TestDialog} dialog */
function makeNonOpening(dialog) {
    dialog.openOnConnect = false;
}

/** @param {TestDialog} dialog */
function finishAndClose(dialog) {
    dialog.complete();
    // jsdom does not implement opening and closing the native dialog.
    dialog.shadowRoot.querySelector("dialog").dispatchEvent(new Event("close"));
}
