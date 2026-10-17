import githubChangelog from "@changesets/changelog-github";

/**
 * Categories describe the change independently of its semantic version bump.
 * @param {{ id: string, summary: string }} changeset
 */
export function parseNote({ id, summary }) {
    const text = summary.trim();
    const marker = /^<!--\s*category:\s*(\w+)\s*-->[ \t]*(?:\r?\n|$)/.exec(
        text
    );
    if (!marker || !["feature", "improvement", "fix"].includes(marker[1])) {
        throw new Error(
            `Changeset ${id} must start with <!-- category: feature -->, <!-- category: improvement -->, or <!-- category: fix -->.`
        );
    }

    const prose = text.slice(marker[0].length).trim();
    if (!prose || /<!--\s*category:/.test(prose)) {
        throw new Error(
            `Changeset ${id} needs one category marker followed by a changelog entry.`
        );
    }
    return { category: marker[1], summary: prose };
}

/** @type {import("@changesets/types").ChangelogFunctions} */
const formatter = {
    getReleaseLine(changeset, type, options) {
        const { summary } = parseNote(changeset);
        return githubChangelog.getReleaseLine({ ...changeset, summary }, type, {
            ...options,
            template: "- {summary} {ref} {authors}",
        });
    },
    getDependencyReleaseLine: githubChangelog.getDependencyReleaseLine,
};

export default formatter;
