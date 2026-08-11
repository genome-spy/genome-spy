import { describe, expect, test } from "vitest";
import { convertSnippet, renderHoverMarkdown } from "./jsonLanguageService.js";

describe("JSON language service", () => {
    test("converts language-server snippets for CodeMirror", () => {
        // Property names escape '$', while tab stops use unbraced LSP syntax.
        expect(convertSnippet('"\\$schema": "$1"')).toBe(
            '"$schema": "${1}"${0}'
        );
        expect(convertSnippet('"axes": {${1:default}, $0}')).toBe(
            '"axes": {${1:default}, ${0}}'
        );
    });

    test("renders escaped schema documentation as safe HTML", () => {
        const markdown =
            "Examples:\\\n\\- \\`padding: 10\\`\\\n\\\n" +
            "\\*\\*Default value:\\*\\* \\`0\\`";

        expect(renderHoverMarkdown([markdown])).toBe(
            "<p>Examples:</p>\n" +
                "<ul>\n<li><code>padding: 10</code></li>\n</ul>\n" +
                "<p><strong>Default value:</strong> <code>0</code></p>"
        );
        expect(renderHoverMarkdown(["<img src=x onerror=alert(1)>"])).toBe(
            "&lt;img src=x onerror=alert(1)&gt;"
        );
    });
});
