import { expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import CloneTransform from "./clone.js";

test("CloneTransform clones the data objects", () => {
    const data = [{ x: 1 }, { x: 2 }];
    const clonedData = processData(new CloneTransform(), data);

    expect(clonedData).toEqual(data);
    expect(clonedData[0]).not.toBe(data[0]);
});
