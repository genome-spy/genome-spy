import { expect, test } from "vitest";

import viteConfig from "../vite.config.js";

test("dedupes React for the linked component example", () => {
    // The example imports the component from a workspace package, so React must be deduped.
    expect(viteConfig.resolve?.dedupe).toEqual(
        expect.arrayContaining(["react", "react-dom"])
    );
});
