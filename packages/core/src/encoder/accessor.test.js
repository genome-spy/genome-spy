import { describe, expect, test } from "vitest";

import ParamMediator from "../view/paramMediator.js";
import {
    createAccessor,
    getAccessorDomainKey,
    isScaleAccessor,
} from "./accessor.js";

describe("Accessor domain keys", () => {
    test("Domain keys are derived from field definitions", () => {
        // ParamMediator is required even when accessors only read fields.
        const paramMediator = new ParamMediator(() => undefined);
        const accessor = createAccessor(
            "x",
            { field: "value", type: "quantitative" },
            paramMediator
        );

        expect(accessor.domainKeyBase).toBe("field|value");
        if (!isScaleAccessor(accessor)) {
            throw new Error("Expected a scale accessor for x channel.");
        }
        expect(getAccessorDomainKey(accessor, "quantitative")).toBe(
            "quantitative|field|value"
        );
    });

    test("Domain keys are derived from expressions", () => {
        const paramMediator = new ParamMediator(() => undefined);
        const accessor = createAccessor(
            "x",
            { expr: "datum.value + 1", type: "quantitative" },
            paramMediator
        );

        expect(accessor.domainKeyBase).toBe("expr|datum.value + 1");
        if (!isScaleAccessor(accessor)) {
            throw new Error("Expected a scale accessor for x channel.");
        }
        expect(getAccessorDomainKey(accessor, "quantitative")).toBe(
            "quantitative|expr|datum.value + 1"
        );
    });

    test("Domain keys are derived from datum values", () => {
        const paramMediator = new ParamMediator(() => undefined);
        const accessor = createAccessor(
            "x",
            { datum: 123, type: "quantitative" },
            paramMediator
        );

        expect(accessor.domainKeyBase).toBe("datum|123");
        if (!isScaleAccessor(accessor)) {
            throw new Error("Expected a scale accessor for x channel.");
        }
        expect(getAccessorDomainKey(accessor, "quantitative")).toBe(
            "quantitative|datum|123"
        );
    });
});
