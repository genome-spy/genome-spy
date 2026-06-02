// @ts-check
import { describe, expect, it } from "vitest";
import {
    formatGroupLevelHeader,
    formatRemoveGroupLabel,
    formatUngroupLabel,
    getGroupLevelAtPosition,
} from "./sampleGroupView.js";

describe("SampleGroupView helpers", () => {
    it("resolves group levels from horizontal level regions", () => {
        expect(getGroupLevelAtPosition(0, 72, 3)).toBe(1);
        expect(getGroupLevelAtPosition(23.9, 72, 3)).toBe(1);
        expect(getGroupLevelAtPosition(24, 72, 3)).toBe(2);
        expect(getGroupLevelAtPosition(47.9, 72, 3)).toBe(2);
        expect(getGroupLevelAtPosition(48, 72, 3)).toBe(3);
        expect(getGroupLevelAtPosition(71.9, 72, 3)).toBe(3);
    });

    it("rejects positions outside level regions", () => {
        expect(getGroupLevelAtPosition(-1, 72, 3)).toBeUndefined();
        expect(getGroupLevelAtPosition(72, 72, 3)).toBeUndefined();
        expect(getGroupLevelAtPosition(0, 72, 0)).toBeUndefined();
        expect(getGroupLevelAtPosition(0, 0, 3)).toBeUndefined();
    });

    it("formats level-specific context menu labels", () => {
        expect(formatGroupLevelHeader("Diagnosis", 1, 1)).toBe("Diagnosis");
        expect(formatGroupLevelHeader("Diagnosis", 1, 2)).toBe(
            "Diagnosis (level 1)"
        );
        expect(formatRemoveGroupLabel("Adenocarcinoma")).toBe(
            "Remove group Adenocarcinoma"
        );
        expect(formatUngroupLabel(1)).toBe("Ungroup");
        expect(formatUngroupLabel(2)).toBe("Ungroup from this level");
    });
});
