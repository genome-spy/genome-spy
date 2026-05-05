/**
 * @typedef {{
 *     value: string;
 *     label: string;
 *     description?: string;
 * }} ClarificationOption
 */

/**
 * Parses a clarification message that encodes options as a numbered Markdown
 * list.
 *
 * @param {string | import("lit").TemplateResult} content
 * @returns {{
 *     text: string | import("lit").TemplateResult;
 *     options: ClarificationOption[];
 * }}
 */
export function parseClarificationMessage(content) {
    if (typeof content !== "string") {
        return {
            text: content,
            options: [],
        };
    }

    const normalized = content.replace(/\r\n/g, "\n").trim();
    const lines = normalized.split("\n");
    const firstOptionLine = lines.findIndex((line) =>
        /^\s*\d+[.)]\s+/.test(line)
    );

    if (firstOptionLine < 0) {
        return {
            text: normalized,
            options: [],
        };
    }

    const question = lines.slice(0, firstOptionLine).join("\n").trim();
    const options = lines.slice(firstOptionLine).flatMap((line) => {
        const match = line.match(/^\s*\d+[.)]\s+(.*\S.*)$/);
        if (!match) {
            return [];
        }

        const label = match[1].trim();
        return [
            {
                value: label,
                label,
            },
        ];
    });

    if (options.length < 2) {
        return {
            text: normalized,
            options: [],
        };
    }

    return {
        text: question || normalized,
        options,
    };
}
