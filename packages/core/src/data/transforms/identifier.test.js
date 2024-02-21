import { expect, test } from "vitest";
import { range } from "d3-array";
import { processData } from "../flowTestUtils.js";
import IdentifierTransform, {
    BLOCK_SIZE,
    UNIQUE_ID_KEY,
} from "./identifier.js";

test("An IdentifierTransform adds identifiers correctly", () => {
    const data = range(BLOCK_SIZE * 2).map((x) => ({ data: x }));

    const identifiedData = processData(
        new IdentifierTransform({ type: "identifier" }),
        data
    );

    // The fist block is skipped
    const firstId = BLOCK_SIZE;

    expect(identifiedData[0]).toEqual({ data: 0, [UNIQUE_ID_KEY]: firstId });
    expect(identifiedData[1]).toEqual({
        data: 1,
        [UNIQUE_ID_KEY]: firstId + 1,
    });
    expect(identifiedData[BLOCK_SIZE]).toEqual({
        data: BLOCK_SIZE,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE,
    });
    expect(identifiedData[BLOCK_SIZE + 1]).toEqual({
        data: BLOCK_SIZE + 1,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE + 1,
    });
});

test("Another transform instance adds identifiers correctly", () => {
    const data = range(BLOCK_SIZE * 2).map((x) => ({ data: x }));
    // Another instance
    const identifiedData = processData(
        new IdentifierTransform({ type: "identifier" }),
        data
    );

    // The fist block was skipped and the previous test case consumed two blocks
    const firstId = BLOCK_SIZE * 3;

    expect(identifiedData[0]).toEqual({ data: 0, [UNIQUE_ID_KEY]: firstId });
    expect(identifiedData[1]).toEqual({
        data: 1,
        [UNIQUE_ID_KEY]: firstId + 1,
    });
    expect(identifiedData[BLOCK_SIZE]).toEqual({
        data: BLOCK_SIZE,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE,
    });
    expect(identifiedData[BLOCK_SIZE + 1]).toEqual({
        data: BLOCK_SIZE + 1,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE + 1,
    });
});

test("IdentifierTransform recycles allocated blocks", () => {
    let data = range(BLOCK_SIZE * 2).map((x) => ({ data: x }));

    const transform = new IdentifierTransform({ type: "identifier" });
    let identifiedData = processData(transform, data);

    let firstId = BLOCK_SIZE * 5;

    expect(identifiedData[0]).toEqual({ data: 0, [UNIQUE_ID_KEY]: firstId });
    expect(identifiedData[BLOCK_SIZE]).toEqual({
        data: BLOCK_SIZE,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE,
    });

    data = range(BLOCK_SIZE * 3).map((x) => ({ data: x }));

    // Resetting the transform. It should now reuse the allocated blocks.
    transform.reset();
    identifiedData = processData(transform, data);

    expect(identifiedData[0]).toEqual({ data: 0, [UNIQUE_ID_KEY]: firstId });
    expect(identifiedData[BLOCK_SIZE]).toEqual({
        data: BLOCK_SIZE,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE,
    });

    // ... and reserve one extra
    expect(identifiedData[BLOCK_SIZE * 2]).toEqual({
        data: BLOCK_SIZE * 2,
        [UNIQUE_ID_KEY]: firstId + BLOCK_SIZE * 2,
    });
});
