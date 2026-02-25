/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("./provenance.js").default} Provenance
 *
 * @typedef {object} KeyboardShortcut
 * @prop {string} code
 * @prop {(event: KeyboardEvent) => boolean | void} run
 * @prop {(() => boolean) | undefined} [isEnabled]
 * @prop {boolean | undefined} [allowEditableTarget]
 */

/**
 * @param {object} options
 * @param {View} options.viewRoot
 * @param {KeyboardShortcut[]} options.shortcuts
 */
export function setupAppKeyboardShortcuts({ viewRoot, shortcuts }) {
    viewRoot.context.addKeyboardListener("keydown", (event) =>
        handleKeyboardShortcuts(event, shortcuts)
    );
}

/**
 * @param {object} options
 * @param {Provenance} options.provenance
 * @param {() => boolean} options.focusSearchField
 * @returns {KeyboardShortcut[]}
 */
export function createDefaultAppKeyboardShortcuts({
    provenance,
    focusSearchField,
}) {
    return [
        {
            code: "KeyZ",
            isEnabled: () => provenance.isUndoable(),
            run: () => {
                provenance.undo();
                return true;
            },
        },
        {
            code: "KeyF",
            run: () => focusSearchField(),
        },
    ];
}

/**
 * @param {KeyboardEvent} event
 * @param {KeyboardShortcut[]} shortcuts
 * @returns {boolean}
 */
export function handleKeyboardShortcuts(event, shortcuts) {
    if (event.defaultPrevented) {
        return false;
    }

    for (const shortcut of shortcuts) {
        if (!matchesPlainKeyShortcut(event, shortcut.code)) {
            continue;
        }

        if (
            shortcut.allowEditableTarget !== true &&
            shouldIgnoreShortcutTarget(event.target)
        ) {
            continue;
        }

        if (shortcut.isEnabled && !shortcut.isEnabled()) {
            continue;
        }

        const handled = shortcut.run(event);
        if (handled !== false) {
            event.preventDefault();
            return true;
        }
    }

    return false;
}

/**
 * @param {KeyboardEvent} event
 * @param {string} code
 * @returns {boolean}
 */
export function matchesPlainKeyShortcut(event, code) {
    if (
        event.code == code &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
    ) {
        return true;
    } else {
        return false;
    }
}

/**
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function shouldIgnoreShortcutTarget(target) {
    const candidate =
        /** @type {{ tagName?: unknown, isContentEditable?: unknown, closest?: unknown }} */ (
            target
        );
    if (
        !target ||
        typeof target !== "object" ||
        typeof candidate.tagName !== "string"
    ) {
        return false;
    }

    if (candidate.isContentEditable === true) {
        return true;
    }

    const tagName = candidate.tagName.toUpperCase();
    if (tagName == "INPUT" || tagName == "TEXTAREA" || tagName == "SELECT") {
        return true;
    }

    if (typeof candidate.closest !== "function") {
        return false;
    }

    return !!candidate.closest.call(
        target,
        "input, textarea, select, [contenteditable=true], [contenteditable='true']"
    );
}
