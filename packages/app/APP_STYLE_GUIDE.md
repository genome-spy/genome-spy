# GenomeSpy App Style Guide

## Overview

This guide captures the UI patterns we use in dialogs and shared UI so new
changes feel consistent. It focuses on UX conventions rather than plumbing.

## Dialog structure

- **Layout:** Title in the header, content in the body, actions in the footer.
- **Content first:** Explanatory text or alerts appear at the top of the body,
  followed by the main controls.
- **Footer alignment:** Actions are right-aligned.

Code pointers: `src/components/generic/baseDialog.js`,
`src/components/dialogs/*`, `src/sampleView/*Dialog*.js`.

## Action placement and labeling

- **Primary action on the right.** Secondary or cancel actions are placed to
  the left of the primary.
- **Single primary action:** If there is one main action, it should be the
  rightmost button.
- **Verb-first labels:** Use clear, short verbs (e.g., *Save*, *Group*, *Retain*).

Code pointers: dialog `renderButtons()` methods.

## Usability principles

- **State the purpose:** If the action is not obvious, add a one-sentence
  explanation at the top of the dialog.
- **Primary action clarity:** Use explicit verbs and keep the primary action
  visually distinct and right-aligned.
- **Safe defaults:** Pre-fill sensible values and keep required fields visible.
- **Validation flow:** Show inline errors near the field and only disable the
  primary action *after* the first validation failure.
- **Avoid surprises:** Destructive actions are explicit and separated from the
  primary action.
- **Keyboard flow:** Focus the first input when possible; Enter activates the
  primary action only from text-like inputs.

## Confirmation and risk

- **Confirm the irreversible:** Add confirmation only for destructive or
  surprising outcomes.
- **Prefer undo over extra prompts:** If the action is reversible, avoid
  modal confirmation and rely on undo/history instead.

## Progress and waiting

- **Show status for slow actions:** Long-running work should show progress or
  a clear status with the option to cancel.
- **Avoid unnecessary blocking:** If possible, keep unrelated UI usable while
  work is in progress.

## Wording and tone

- **User-facing language:** Avoid internal or technical terms in labels and
  helper text.
- **Short helper text:** One idea per sentence; keep it skimmable.

## Consistency and reuse

- **Consistent labels:** Use the same wording for the same concept across
  dialogs.
- **Stable action order:** Keep action ordering consistent across dialogs with
  similar roles.

## Accessibility basics

- **Visible labels:** Every input has a readable label.
- **Logical focus order:** Tab order should match the visual layout.

## Primary action behavior

- **Enter activates primary** when focus is in a text-like input field.
- **No accidental submit:** Enter does not trigger when focus is on buttons,
  checkboxes, selects, or textareas.

Code pointer: `src/components/generic/baseDialog.js`.

## Messaging and guidance

- **Use alert banners** for short guidance or warnings near the top of the body.
- **Icons help scanning:** Include an info/warning icon when the banner is
  instructional or cautionary.

Code pointers: `.gs-alert` in `src/components/generic/componentStyles.js`,
examples in `src/components/dialogs/enterBookmarkDialog.js` and
`src/components/dialogs/saveImageDialog.js`.

## Forms

- **Labels above inputs** with helper text below.
- **Short helper text** for constraints or expectations.
- **Validation feedback** appears close to the field.

Code pointers: `src/components/forms/*`, dialog forms in
`src/components/dialogs/enterBookmarkDialog.js`.

## Toolbar

- **Compact height** with evenly spaced controls.
- **Search field** reads as an inline input, visually separated from buttons.

Code pointers: `src/styles/genome-spy-app.scss`.
