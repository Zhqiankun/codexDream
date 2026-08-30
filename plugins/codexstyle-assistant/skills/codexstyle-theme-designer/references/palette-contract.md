# CodexStyle palette contract

Supply all 29 keys on every palette update. Use CSS `#RGB`, `#RRGGBB`, `#RGBA`, `#RRGGBBAA`, `rgb(...)`, or `rgba(...)` colors.

## Surfaces and text

- `background`: page and main canvas
- `panel`: sidebar and dialogs
- `sidebarText`: sidebar navigation and project text
- `threadTabBackground` / `threadTabText`: active conversation title
- `homeTitleText`: home welcome title
- `homeCardBackground` / `homeCardText`: four home shortcut cards
- `panelAlt`: composer and user-message surface
- `composerText`: typed composer text
- `assistantPanel` / `assistantMessageText`: assistant response surface and text
- `userMessageText`: user-message text
- `changeCardBackground` / `changeCardText`: edited-files card
- `activityBackground` / `activityText` / `activityMuted`: commands, edits, and thinking status
- `topBarBackground` / `topBarText`: native-style application header area

## Actions and feedback

- `accent`: primary button background, permission status, and send action
- `accentText`: primary button text and icon
- `accentAlt`: focus and primary-button border
- `secondary`: composer toolbar actions
- `highlight` / `selectionText`: selected-text background and foreground

## General content

- `text`: primary body text
- `muted`: placeholders and explanatory text
- `line`: borders and separators

## Contrast requirements

Call `validate_palette` before writing. Primary text pairs must reach at least 4.5:1; muted text pairs must reach at least 3:1. Keep translucent surfaces intentional and verify them in both Home and Conversation Live Preview after the draft is created.
