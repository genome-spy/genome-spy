/**
 * @param {string} initialValue
 */
export function createEditorState(initialValue = "") {
    let value = initialValue;

    return {
        /**
         * @returns {string}
         */
        get() {
            return value;
        },

        /**
         * @param {string} nextValue
         */
        set(nextValue) {
            value = nextValue;
        },

        /**
         * @param {{ value: string } | undefined} editor
         */
        syncFromEditor(editor) {
            if (editor) {
                value = editor.value;
            }
        },

        /**
         * @param {{ value: string } | undefined} editor
         * @returns {string}
         */
        getCurrent(editor) {
            return editor ? editor.value : value;
        },
    };
}
