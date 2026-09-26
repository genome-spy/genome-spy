# Accessible App menus

## Problem and current design

App menus are rendered by two paths. `src/utils/ui/contextMenu.js` creates
floating context menus and the view settings dropdown, while `toolbar.js`,
`bookmarkButton.js`, and `provenanceToolbar.js` create inline toolbar dropdowns
using `toggleDropdown`. The floating renderer makes action items from anchors
without `href`, opens submenu `<div>` elements only on `mouseenter`, and has no
focus or keyboard handling. Its submenu arrow is CSS only. The view settings
dropdown adds native checkboxes, radios, and parameter inputs through
`customContent`, so it is not an action menu. It combines a checkbox label and
an undiscoverable hover target in one row. The inline dropdowns likewise use
link-shaped controls without links, and bookmark overflow actions are shown
only on hover. These structures hide available actions and submenu state from
the accessibility tree and from agents that inspect it.

## Goals

- Expose menu actions, disabled state, submenu availability and expansion, and
  view visibility controls with accurate names, roles, and state.
- Make every open menu and nested submenu operable without a mouse, with
  visible focus and predictable return of focus.
- Keep native checkbox, radio, and parameter input behavior in view settings;
  preserve the existing mouse hover path and application actions.
- Cover floating context menus, view settings, and inline toolbar dropdowns.

## Non-goals

- Change visibility, bookmark, provenance, or sample action state semantics.
- Replace the App's menu appearance or adopt a component library.
- Add a global shortcut to open canvas context menus. The current canvas
  context-menu callers only receive pointer coordinates, so keyboard-only
  invocation of those menus remains a separate gap. Once open, their contents
  are accessible. Toolbar menus must be keyboard-invocable.
- Guarantee a particular screen reader's output without assistive technology
  testing. The implementation will expose standards-based semantics and verify
  the DOM and browser interaction.

## Standards and design decisions

Use the [WAI-ARIA menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
and [menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) for lists
of commands. Trigger buttons announce `aria-haspopup="menu"` and expansion;
the list has `role="menu"`, actions have `role="menuitem"`, separators have
`role="separator"`, and unavailable choices expose `aria-disabled` while
remaining inert. Use presentational list wrappers so only menu items, groups,
and separators are exposed as menu children. Label each root and submenu.
Opening the menu moves focus to an item. Up/Down wrap among items, Home/End
reach the ends, Right/Enter/Space open a submenu, Left/Escape closes it and
returns focus, and Escape at the root closes the menu. Tab or Shift+Tab closes
the menu and moves focus outside it. Disabled entries may receive navigation
focus but cannot activate. Mouse hover continues to work. Submenu triggers
show a visible affordance as well as `aria-haspopup`, `aria-expanded`, and
`aria-controls` only while the target popup exists. Do not copy code from the
APG examples.

The view settings popup contains native controls and is a labeled non-modal
`dialog`, not an ARIA `menu`: the [menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)
expects menu items, whereas view settings embeds form controls. The toolbar
button announces `aria-haspopup="dialog"` and expansion. A view row retains
its native labeled checkbox or radio and gains a separate, named button to
open that view's settings submenu. Nested panels with parameter inputs also
use labeled dialog semantics. In this mode, callbacks render as native buttons,
and headers as non-interactive headings; no `menuitem` roles leak into it.
Opening the root or a child panel moves focus to its first interactive control.
Tab and Shift+Tab follow the native control order within the open panel chain;
at the boundary they return to the toolbar trigger or close the panel, never
move focus behind the backdrop. Escape and the toolbar trigger provide an
explicit exit. Escape closes the current panel and returns focus to its trigger;
at the root it closes the popup and returns to the toolbar button. Outside
pointer dismissal must reset expansion without stealing focus. Hover-open
panels remain while pointer or focus is within their trigger/panel chain.
The popup is not marked modal because outside content is not made inert. Keep
labels and submenu buttons as distinct controls to avoid nested interactive
elements or misleading `menuitemcheckbox` roles.

For inline toolbar dropdowns, use semantic buttons for commands and accurate
expanded state on their triggers. If they are converted to the shared action
menu renderer, preserve their dynamic bookmark/provenance contents and current
visual behavior. A separate, named bookmark overflow button remains reachable
by keyboard and visible on focus. Its overflow menu returns focus to that
button, not the bookmark row. Preserve standard Tab behavior wherever a popup
contains native controls. Do not assign `role="menu"` to a list that contains
arbitrary form widgets.

The [WCAG guidance for hover or focus content](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus)
requires popups to be dismissible, hoverable, and persistent while used.
Closing a panel must cancel pending hover opens and prevent stale asynchronous
submenu results from reappearing. Focus styles must be visible for keyboard
users. One dismissal lifecycle handles Escape, Tab/focus exit, outside pointer,
selection, and switching triggers. It clears pending hover work and updates
`aria-expanded` on every path. After selecting a command that opens a dialog,
do not restore focus over the new dialog. View settings re-renders after state
changes, so preserve focus using a stable view-selector identity or move it to
an equivalent visible control deliberately.

## Milestones

### 1. Shared floating command menus

- **Outcome:** Context menus and action-only dropdowns expose command/menu
  semantics, submenu state, and keyboard navigation. Their actions use real
  buttons or correctly focusable menu items; a user can open, traverse, invoke,
  and dismiss nested menus with the keyboard.
- **Areas and consumers:** `src/utils/ui/contextMenu.js`, menu SCSS, and all
  sample view, metadata, selection, and bookmark callers using that renderer.
- **Verification:** Focused jsdom tests for roles, focus movement, action
  invocation, disabled items, asynchronous submenu replacement, Escape,
  Tab/Shift+Tab, and mouse behavior; App TypeScript checks and focused browser
  smoke checks. Check inline `menuItemToTemplate` consumers for interim
  compatibility before milestone 3.
- **Docs/migration:** No public API migration; adjust menu item typing and
  internal comments as needed.
- **Tentative commit:** `feat(app): make floating action menus accessible`

### 2. View settings as a controls popup

- **Outcome:** View visibility checkboxes/radios and separate settings buttons
  are independently discoverable and keyboard operable. Parameter and metadata
  panels announce their relationship and remain operable after async loading.
- **Areas and consumers:** `viewSettingsButton.js`, the shared popup renderer's
  control mode, related SCSS, and visibility menu tests. Redux behavior stays
  the same.
- **Verification:** Focused component and popup tests for native state,
  accessible names, submenu expansion, focus return, focus after re-render,
  and updates while open; browser inspection of the visibility menu in a real
  App example.
- **Docs/migration:** Update the user guide with the discoverable settings
  control and keyboard use if the final interaction warrants it.
- **Tentative commit:** `feat(app): expose view settings controls and submenus`

### 3. Inline toolbar dropdowns and integration

- **Outcome:** More, bookmark, and provenance dropdowns have named triggers,
  semantic commands, and keyboard dismissal/navigation. Bookmark overflow
  actions are available on focus. All menu families have consistent visible
  focus treatment.
- **Areas and consumers:** Toolbar components, `dropdown.js` if retained,
  shared menu styling, and App documentation.
- **Verification:** Focused toolbar tests, App TypeScript checks, and browser
  smoke checks for More, bookmarks, provenance, view settings, and one nested
  sample context menu. Check accessible names/roles, mouse operation, keyboard
  operation, focus return, and console errors.
- **Docs/migration:** Update relevant user-facing App menu documentation.
- **Tentative commit:** `feat(app): make toolbar dropdowns keyboard accessible`

## Risks and open choices

- Floating menus are also used from canvas coordinates. Preserve focus return
  to the previously focused element when no DOM opener exists, and avoid
  claiming a nonexistent relationship to the canvas.
- Visibility rows may be re-rendered after a toggle; focus and expanded state
  must survive or move to an equivalent control deliberately.
- `MenuItem.customContent` may contain arbitrary inputs. The renderer needs an
  explicit control-popup mode and must not infer ARIA semantics from its
  template contents.
- An async submenu may resolve after a different item opens or the popup
  closes; verify that stale content cannot replace the active submenu.
- If unifying inline and floating renderers would substantially increase code
  or complicate dynamic content, keep a small inline path with equivalent
  semantics. Measure before and after and prefer deleting duplicate behavior.

## Acceptance criteria and final review

- An agent inspecting the accessibility tree can identify every visible
  submenu trigger in view settings, tell whether it is expanded, and reach it
  without hover.
- Open context menus and toolbar command menus announce actions and can be
  traversed and dismissed with keyboard alone. Toolbar menus can be opened
  with the keyboard. Canvas context-menu keyboard invocation remains an
  explicit follow-up. View settings keeps native controls and offers keyboard
  access to every nested panel.
- Opening and closing menus returns focus predictably; no popup remains after
  dismissal or stale async completion.
- Existing mouse actions, visibility state updates, bookmark operations, and
  provenance actions still work.
- Focused tests, App TypeScript checks, and representative browser interactions
  pass. A final independent review inspects downstream callers and remaining
  accessibility gaps, not just the local diffs.

Review the plan before implementation, and review the integrated change after
the milestones. Reconcile every item above in Git history before deleting this
temporary plan in a later commit.

## Final reconciliation

- **Complete:** All three milestones were implemented. Command menus have
  menu semantics and keyboard navigation; view settings uses labeled control
  dialogs with native inputs and separate settings buttons; toolbar menus use
  the shared command renderer. Bookmark overflow and provenance history remain
  accessible, and the provenance menu stays open during back/forward navigation.
- **Complete:** Focus, submenu expansion, async loading, hover dismissal,
  styling, and toolbar placement were checked in the MCCA example and covered
  by focused tests. The user guide documents the keyboard interactions.
- **Complete:** The final branch passed the full unit suite, workspace
  TypeScript checks, lint, and the App production build.
- **Complete:** The independent final review found bookmark loading and
  keyboard focus gaps. These were fixed, covered by focused tests, and
  reviewed again with no remaining findings.
- **Discarded:** The conditional fallback to a separate inline command
  renderer. Keeping it would duplicate menu semantics and keyboard behavior.
  Two attempts to extract view settings also increased production code, so the
  shared popup host with distinct command and control renderers was retained.
- **Out of scope as planned:** A keyboard shortcut to invoke canvas context
  menus and screen-reader-specific certification.
