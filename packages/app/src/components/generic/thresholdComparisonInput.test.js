// @ts-check
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
    getSingleThresholds,
    isFiniteNumber,
    parseThresholdOperand,
    default as ThresholdComparisonInput,
    updateOperandFromAddedThreshold,
} from "./thresholdComparisonInput.js";

describe("parseThresholdOperand", () => {
    it("parses finite signed numeric input", () => {
        expect(parseThresholdOperand("-1.25")).toBe(-1.25);
        expect(parseThresholdOperand(" 2.5 ")).toBe(2.5);
    });

    it("ignores empty and non-finite input", () => {
        expect(parseThresholdOperand("")).toBeUndefined();
        expect(parseThresholdOperand("Infinity")).toBeUndefined();
        expect(parseThresholdOperand("abc")).toBeUndefined();
    });
});

describe("getSingleThresholds", () => {
    it("returns one threshold only for finite operands", () => {
        expect(getSingleThresholds(3)).toEqual([3]);
        expect(getSingleThresholds(undefined)).toEqual([]);
        expect(getSingleThresholds(NaN)).toEqual([]);
        expect(getSingleThresholds(Infinity)).toEqual([]);
    });
});

describe("updateOperandFromAddedThreshold", () => {
    it("sets a threshold only when the operand is unset", () => {
        expect(updateOperandFromAddedThreshold(undefined, 4)).toBe(4);
        expect(updateOperandFromAddedThreshold(2, 4)).toBe(2);
    });
});

describe("ThresholdComparisonInput", () => {
    it("forwards focus to the internal input", () => {
        const focus = vi.fn();
        const input = { focus };
        const component = /** @type {ThresholdComparisonInput} */ (
            Object.create(ThresholdComparisonInput.prototype)
        );
        Object.defineProperty(component, "renderRoot", {
            value: {
                querySelector: () => input,
            },
        });

        component.focus({ preventScroll: true });

        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it("dispatches only the wrapper change event when the operator changes", async () => {
        const component = document.createElement(
            "gs-threshold-comparison-input"
        );
        document.body.append(component);
        await /** @type {ThresholdComparisonInput} */ (component)
            .updateComplete;

        const events = [];
        component.addEventListener("change", (event) => {
            events.push(
                event instanceof CustomEvent
                    ? "custom"
                    : /** @type {any} */ (event).operator
            );
        });
        const buttons = component.shadowRoot.querySelector(
            "gs-comparison-operator-buttons"
        );
        const button = /** @type {HTMLButtonElement} */ (
            buttons.shadowRoot.querySelector("button[value='gte']")
        );

        button.click();

        expect(events).toEqual(["gte"]);
        component.remove();
    });

    it("does not dispatch a change when adding a threshold after one exists", async () => {
        const component = /** @type {ThresholdComparisonInput} */ (
            document.createElement("gs-threshold-comparison-input")
        );
        component.operand = 1;
        component.values = [0, 1, 2];
        document.body.append(component);
        await component.updateComplete;

        const listener = vi.fn();
        component.addEventListener("change", listener);
        component.shadowRoot
            .querySelector("gs-histogram")
            .dispatchEvent(new Event("add"));

        expect(listener).not.toHaveBeenCalled();
        component.remove();
    });

    it("dispatches undefined operand when the input is cleared", async () => {
        const component = /** @type {ThresholdComparisonInput} */ (
            document.createElement("gs-threshold-comparison-input")
        );
        component.operand = 1;
        document.body.append(component);
        await component.updateComplete;

        let operand = 1;
        component.addEventListener("change", (event) => {
            operand =
                /** @type {import("./thresholdComparisonInput.js").ThresholdComparisonInputChangeEvent} */ (
                    event
                ).operand;
        });
        const input = component.shadowRoot.querySelector("input");
        input.value = "";
        input.dispatchEvent(new Event("input"));

        expect(operand).toBeUndefined();
        component.remove();
    });
});

describe("isFiniteNumber", () => {
    it("matches only finite numbers", () => {
        expect(isFiniteNumber(1)).toBe(true);
        expect(isFiniteNumber(NaN)).toBe(false);
        expect(isFiniteNumber(Infinity)).toBe(false);
        expect(isFiniteNumber("1")).toBe(false);
    });
});
