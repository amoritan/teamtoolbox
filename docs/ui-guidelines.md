# UI guidelines

How teamtoolbox looks and behaves. These rules apply to the directory site (`apps/home`), every tool app (`apps/<slug>`) and the shared components in `packages/ui`.

They build on the spec: the privacy model (§5), the third-party-code boundary (§5.6), security headers (§10.4) and the ad rules (§11) in [tech-spec.md](tech-spec.md). Where this guide and the spec disagree, the spec wins and this guide needs fixing.

The interaction patterns started from Apple's Human Interface Guidelines, adapted for the web, and the accessibility rules follow WCAG 2.2 AA. See [Sources](#sources).

## 1. Principles

1. **The task comes first.** People open a tool minutes before a meeting. The first screen does the job, starting or joining a room, with no sign-up, tour or splash screen.
2. **Privacy is shown, not just promised.** Say what's encrypted where it matters (the privacy badge, the share dialog), in plain words. A room's secret is only ever shown as part of its share link.
3. **Undo beats "Are you sure?".** Reversible actions happen straight away and offer undo. Ask for confirmation only when something can't be undone, especially when it affects everyone in the room.
4. **Few modal moments.** Prefer inline UI to dialogs. Use a dialog only for a short, focused task, and never open one dialog from another.
5. **Always say what's happening.** Connection, saving, waiting for others and errors are shown where they happen, in words. How loud a message is depends on how much it matters: status sits quietly, and only things that need a decision interrupt.
6. **Essentials first, details on request.** Good defaults make most options unnecessary. Advanced options go behind a "More options" disclosure.
7. **Works for everyone in the room.** Keyboard, screen readers, phones, small screens, zoom, dark mode and reduced motion are all first-class. Someone joining from a phone mid-meeting is a main case, not an edge case.
8. **Calm.** No decorative animation, sounds, confetti or gamification. The ad never moves.

## 2. Accessibility baseline

The target is **WCAG 2.2 AA**. In practice:

- **Contrast.** Text needs 4.5:1, or 3:1 when large (24 px, or 19 px bold). Anything that identifies a control or its state, like an input's border or a checkbox, needs 3:1 against its background.
- **Never colour alone.** Every status has an icon and a label as well as a colour. The health check's green, amber and red already work this way (spec §15.2).
- **Keyboard.** Everything works without a mouse, in a logical order, with a visible focus ring (the 2 px accent outline `Button` uses). Esc closes the topmost overlay and returns focus to what opened it. Nothing traps focus except an open dialog.
- **Focus stays visible.** Toasts, banners and sticky bars must not cover the focused element (WCAG 2.4.11).
- **Target size.** Controls are at least 24 × 24 px (WCAG 2.5.8). Aim for 44 × 44 px for controls used often on phones, like voting.
- **Dragging is optional.** Anything you can drag can also be done with a click or a menu (WCAG 2.5.7). See §5.9.
- **Announce what matters.** Use a polite live region for phase changes, lost and restored connections, errors and "Undo" offers. Don't announce every remote keystroke or every card someone else adds.
- **Labels.** Every input has a visible label. A placeholder is an example, never the label. Error text is linked to its field with `aria-describedby`.
- **Zoom and reflow.** Pages work at 200 % zoom and at 320 px wide without sideways scrolling. The one exception is a wide board, which scrolls inside its own region.
- **Motion.** Respect `prefers-reduced-motion`. Nothing moves on its own.
- **Structure.** Use real headings in order, landmarks (`AppShell` provides header, main and footer, and the ad is a labelled `aside`) and `lang="en"`.

How to check: use the page with the keyboard only, do a quick pass with VoiceOver or NVDA, and run axe. Axe will run automatically in the Playwright tests planned for M1.

### Current token contrast

Measured from `packages/ui/src/theme.css`:

| Pair                                      | Light     | Dark       | Fine for                           |
| ----------------------------------------- | --------- | ---------- | ---------------------------------- |
| `ink` on `surface`                        | 17.2:1    | 16.1:1     | Any text                           |
| `ink-muted` on `surface`                  | 7.2:1     | 8.0:1      | Any text                           |
| `ink-muted` on `surface-muted`            | 6.6:1     | 7.3:1      | Any text                           |
| `accent` on `surface`                     | 5.1:1     | 7.4:1      | Links, focus ring, text            |
| `accent-ink` on `accent`                  | 5.1:1     | 7.5:1      | Primary button text                |
| `good` / `warn` / `bad` on `surface`      | 5.1–6.5:1 | 7.4–10.0:1 | Status text and icons              |
| `line-strong` on either surface           | 3.2–3.5:1 | 3.2–3.5:1  | Form control borders               |
| `participant-1` to `-8` on either surface | 4.6–5.5:1 | 4.6–4.7:1  | Avatars and markers, with initials |
| `line` on `surface`                       | 1.3:1     | 1.4:1      | **Decorative dividers only**       |

`line` is too faint to show where an input is, so form controls use `line-strong`.

`packages/ui/test/theme.test.ts` checks every pair in this table, in both modes and on both surfaces. `pnpm test` fails if a change to `theme.css` drops one below its WCAG minimum.

## 3. Visual foundations

### Colour

Use the tokens through their Tailwind names (`bg-surface`, `text-ink-muted`, `border-line` and so on). Apps never use raw hex values, so dark mode works everywhere without extra effort. Check both modes anyway.

| Token                     | Use for                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `surface`                 | Page background, cards                                            |
| `surface-muted`           | Secondary areas: side panels, the ad card, hover backgrounds      |
| `ink`                     | Main text                                                         |
| `ink-muted`               | Secondary text, hints, metadata                                   |
| `line`                    | Dividers and card outlines that are decoration                    |
| `line-strong`             | Borders of inputs, text areas, checkboxes and other form controls |
| `accent`, `accent-strong` | The primary action, links, focus, the current selection           |
| `accent-ink`              | Text on an accent background                                      |
| `good`, `warn`, `bad`     | Status meaning only, always with an icon and a label              |
| `participant-1` to `-8`   | Who's who: avatars, card author markers, cursors                  |

- One primary (accent) button per view. Everything else is secondary.

#### Participant colours

Eight colours that tell people apart: rose, orange, olive, green, teal, blue, purple and magenta, as `bg-participant-1` to `bg-participant-8`.

- **Always with a name or initials.** An avatar is a circle in the participant's colour with their initials in `text-surface`. The colours are dark enough (light mode) or light enough (dark mode) for that.
- **Assigned in join order,** cycling after the eighth person. Each person keeps their colour for the whole room.
- **Never for anything else.** No status, selection or emphasis. The palette keeps away from the accent's hue so an avatar never looks selected, but its orange and rose are near `warn` and `bad`, so the two sets must never mean the same thing.
- **How they were chosen:** hues at least 35° apart in OKLCH, away from the accent's hue, each made as vivid as possible while reaching 4.6:1 on both surfaces. Colour-blind people may still confuse some pairs, which is another reason names always come first.

### Typography

- The system font stack only, the wordmark included. Tool pages can't load third-party fonts (§10.4), and the brand doesn't need a font of its own (see Logo, below).
- Sizes: `text-sm` for UI controls and metadata, `text-base` for reading text, and `text-xl` to `text-2xl` for page and room titles. Use at most three sizes on one screen.
- Keep prose lines under about 70 characters. Use `tabular-nums` for counts, votes and timers so numbers don't jump around.

### Spacing, shape and depth

- Tailwind's 4 px spacing scale. Group related things with less space between them than between groups.
- `rounded-lg` for controls and cards, `rounded-full` for badges and avatars.
- Borders separate things, shadows don't. The only shadow is the one for floating layers: popovers, menus, dialogs and toasts.

### Icons

- **[Lucide](https://lucide.dev), and only Lucide** (ISC licence). In React, import icons by name from `lucide-react`, for example `import { LockKeyhole } from 'lucide-react'`. Only the icons a tool imports end up in its bundle. If the directory site ever needs icons, use `@lucide/astro`.
- Icons are inline SVG in `currentColor`, bundled with the app. No icon fonts, and nothing loaded from a CDN.
- Size icons with classes: `size-4` next to `text-sm`, `size-3.5` next to `text-xs`. Keep Lucide's default 2 px stroke. Never pass `style`, which the CSP blocks when it's rendered as an HTML attribute.
- **Next to a text label,** leave the icon as it is. Lucide adds `aria-hidden="true"` itself unless you pass an `aria-*`, `role` or `title` prop.
- **On its own,** an icon button needs an accessible name (`aria-label` on the button, not the icon) and a tooltip with the same words.
- Before drawing a custom icon, check Lucide's catalogue. A missing icon is a reason to draw one in Lucide's style (24 px grid, 2 px round strokes), not to add a second set.

### Logo

The mark is four rounded tiles, like the directory's grid of tools, with one in the accent colour: the tool you're using. Next to it, the wordmark reads "team" in regular and "toolbox" in bold.

- **Use the components:** `<Logo>` from `@teamtoolbox/ui` in React, `Logo.astro` on the directory site. Both draw from the same geometry in `packages/ui/src/mark.ts`. Don't copy the SVG elsewhere.
- **Colours come from tokens:** three tiles in `ink`, one in `accent`, so the mark follows light and dark mode by itself. Don't recolour, outline, rotate or rearrange the tiles, and don't put the mark on a coloured background.
- **The wordmark is real text** in the system font, so it's selectable, translatable and costs no font download. It reads as one word to screen readers, and the mark next to it is hidden. On its own, the mark is labelled "teamtoolbox".
- **Sizes:** at least 16 px for the mark. Leave at least one tile's width of space around the whole logo.
- **Favicon:** `apps/home/public/favicon.svg` uses slightly larger tiles for 16 px and switches colours with `prefers-color-scheme`. Tool apps will reuse it.

### Motion

Use motion only to explain a change, like a card moving to a group or a dialog opening. Keep it to 150–200 ms with ease-out, and turn it off under `prefers-reduced-motion`.

## 4. Layout

- **`AppShell` frames every tool.** Its header has the home link, the tool name and the privacy badge. Its footer has the site links and the ad slot. Tool UI goes in `main`, never in the shell's header or footer.
- **Room header.** The first row of `main` holds the room name, who's here, the connection state and the Share button.
- **Width.** Tool pages use `max-w-6xl`. A board can go full width and scroll sideways inside its own region.
- **Small screens first.** Design at 360 px wide first. Board columns stack or become tabs on phones.
- **Where the primary action goes.** At the end of a form, or at the right of the room header for room-level actions.
- **The ad slot keeps its place** (spec §11): fixed size, outside the working area, never in dialogs, exports or print, never sticky, never animated. Don't move or resize it to make room for tool UI.

## 5. Patterns

### 5.1 Starting a tool

- The first screen is the action, like "Start a retro", with only the choices that matter (template and room lifetime) and good defaults (30 days). Everything else can change later.
- No onboarding flow. One sentence says what the tool does, and links to its guide page on the directory site.
- Recent rooms, kept in `localStorage` on the tool's origin, are listed under the start action so facilitators can go back to them.

### 5.2 Sharing and joining

- **Share** is always in the room header. It offers "Copy link" as the main action, and a QR code for meeting-room screens. The QR code is generated in the browser.
- One line explains that the link is the key: "Anyone with this link can join and read this room."
- After copying, the button says "Copied" for about two seconds and the live region announces it. No toast for this.
- **Joining** asks only for a display name, inline rather than in a dialog. It's prefilled from last time, which is stored locally.
- The room secret never appears in page titles, error messages or anything sent to a server. It stays in the URL fragment, which browsers never send.

### 5.3 Presence and connection

- The room header shows who's here: avatars with initials and a colour, names on hover and focus, and "+3" when the row overflows.
- Connection states:

  | State                 | What people see                                                               |
  | --------------------- | ----------------------------------------------------------------------------- |
  | Connecting            | The room frame right away, with a skeleton where the content will be (§5.8)   |
  | Connected             | Nothing special. Being connected is normal                                    |
  | Reconnecting          | An inline banner: "Reconnecting… Your changes will be sent when you're back." |
  | Can't connect         | A banner with what happened and a Retry button                                |
  | Room expired or wiped | A full-page message explaining what happened, with "Start a new room"         |

- Never lose what someone typed. Unsent text and changes wait while reconnecting and are sent afterwards.
- Announce "Connection lost" and "Back online" once each, through the live region.

### 5.4 Feedback and status

Match how loud a message is to how much it matters:

| Situation                                           | How to show it                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Ongoing status ("8 of 10 answered", someone typing) | Quiet inline text next to what it's about                                        |
| The result of your own action                       | The change itself, in place, plus an Undo toast if it's reversible               |
| Something failed, and you can fix it                | An inline message next to the cause, saying how to fix it or with a Retry button |
| A decision is needed and can't be undone            | A dialog (§5.6)                                                                  |

- **Toasts:** one at a time, at the bottom of the screen, never covering the ad or the focused element. They stay at least 5 seconds, pause while hovered or focused, and are announced politely. A toast is never the only place an error appears.
- **Error messages** say what happened and what to do next, in plain words. Error codes appear only when they help with a bug report.

### 5.5 Undo, confirmation and destructive actions

- **Reversible actions** (deleting your own card, removing a vote, ungrouping, renaming) happen straight away and show a toast like "Card deleted" with an Undo button.
- **Keyboard undo:** Ctrl+Z or ⌘Z undoes your last action, and repeats go further back through this session's actions. Inside a text field, the browser's own text undo applies instead.
- **Once others have seen something, undo can't take it back.** Revealing cards is one example. Make sure the person meant to: a clear button label, and a confirmation if one click could do it by mistake.
- **Irreversible actions** (wiping a room, ending it early) need a confirmation dialog:
  - The title names the action and who it affects: "Wipe this room for everyone?"
  - The body says what will be lost.
  - The confirm button repeats the verb ("Wipe room") and uses the `bad` style. Cancel has focus when the dialog opens.

### 5.6 Dialogs, popovers and menus

- Build them on Radix Primitives through `packages/ui` wrappers. Radix handles focus trapping, Esc, returning focus and the ARIA attributes.
- **Use a dialog for:** the QR code, confirming irreversible actions, export options and room settings.
- **Don't use a dialog for:** joining, errors or simple edits. Those stay inline.
- Every dialog has a title. Only one is open at a time, and a dialog never opens another dialog or a nested flow. Keep the content to one screen. On phones, dialogs become full-width sheets at the bottom of the screen.
- If closing a dialog would lose typed text, keep the draft or ask first.
- **CSP:** tool pages only allow our own stylesheets (`style-src 'self'`). Check any new Radix part before using it: one that adds a `<style>` tag at runtime will break.

### 5.7 Entering text

- Every field has a visible label. A placeholder only gives an example.
- Validate as people type, but show errors after they leave the field or submit, not on the first keystroke.
- Show limits before people hit them, like "112 / 280".
- **Card input:** Enter adds the card, and Shift+Enter starts a new line. Single-line fields submit on Enter.
- Pasting works everywhere. Trim spaces at the ends, and otherwise keep people's text exactly as they wrote it.
- Offer choices instead of free text where possible: templates, lifetimes and ratings.

### 5.8 Loading

- Show the page frame immediately, with a skeleton where content is coming. If it takes more than a second, add a short label like "Connecting…" or "Decrypting…".
- No full-page spinners, and no made-up percentages or time estimates.
- A button that starts slow work shows that it's busy ("Creating…"), and can't be pressed twice.

### 5.9 Drag and drop

- Used to group and reorder cards. Every drag has another way to do the same thing: a card menu with "Move to…" and "Group with…", and keyboard dragging (Space to pick up, arrow keys to move, Space to drop, Esc to cancel). Each move is announced.
- Drop targets light up while dragging. The card being dragged stays visible, and Esc or dropping outside a target cancels the move.

### 5.10 Charts and results

- Every chart has a text or table version with the same numbers.
- Use colour, an icon and a label together, as for any status. Show counts as well as percentages.
- Several simple charts side by side beat one complex chart.
- Results are anonymous where the tool promises it. Nothing in the UI hints at who answered what.

### 5.11 Help

- Give a short hint the first time it's useful, like "You have 3 votes" when the voting phase starts. Hints can be dismissed, and that's remembered locally.
- Tooltips are short and in sentence case. They don't repeat the button's name, and they appear on keyboard focus as well as on hover. Essential information never lives only in a tooltip, because phones have no hover.
- Longer explanations belong on the tool's guide page on the directory site, linked from the same place in every tool.

### 5.12 Settings

- Keep settings few. Good defaults should make most of them unnecessary.
- Room settings belong to the room and are changed by the facilitator in a "Room settings" dialog. Personal preferences, like your display name, are stored in your browser.

### 5.13 Export and print

- Exports (Markdown, CSV, JSON) are created in the browser and downloaded directly. Nothing is uploaded.
- When printing, the page hides the app shell's navigation and the ad (`AdSlot` already uses `print:hidden`).

## 6. Writing

- **Sentence case everywhere**, including buttons, headings and menu items.
- **Buttons say what happens:** "Start retro", "Copy link", "Wipe room". Never "OK", "Submit" or "Yes".
- **Plain and short.** "You" is the reader and "we" is teamtoolbox. No exclamation marks.
- **No jargon.** Say "end-to-end encrypted", not "E2EE".
- **No blame.** "This link doesn't work anymore", not "Invalid link".
- **Numbers and times:** use digits, and give times relative to now ("Expires in 29 days").
- **The same words every time:** room, board, card, vote, facilitator and participant, as in the spec.

## 7. Components

Shared components live in `packages/ui`. A component moves there when a second tool needs it, or when it carries a pattern from this guide (like the confirmation dialog). Otherwise it stays in its tool.

| Component                    | Status  | Notes                                                               |
| ---------------------------- | ------- | ------------------------------------------------------------------- |
| `AppShell`                   | Exists  | Header, main, footer and ad slot                                    |
| `Logo`                       | Exists  | The grid mark and wordmark (§3). `Logo.astro` on the directory site |
| `Button`                     | Exists  | Primary and secondary. Needs a `danger` variant and a busy state    |
| `PrivacyBadge`               | Exists  |                                                                     |
| `AdSlot`                     | Exists  | Fixed 320 × 100 px, hidden when printing                            |
| `Dialog`, `ConfirmDialog`    | Planned | Radix Dialog (§5.5, §5.6)                                           |
| `Menu`, `Popover`, `Tooltip` | Planned | Radix (§5.6, §5.11)                                                 |
| `Toast` with Undo            | Planned | Our own small component with a live region (§5.4)                   |
| `CopyLinkButton`, `QrCode`   | Planned | QR code generated locally (§5.2)                                    |
| `Field`, `TextArea`          | Planned | Label, hint, error and counter (§5.7)                               |
| `PresenceList`, `Avatar`     | Planned | §5.3                                                                |
| `ConnectionBanner`           | Planned | §5.3                                                                |
| `Skeleton`, `EmptyState`     | Planned | §5.8                                                                |

## 8. Known gaps

To settle before the first tool (M1) ships:

1. **Automated accessibility checks:** axe in the Playwright end-to-end tests. Token contrast is already checked by `theme.test.ts`.

Closed: the form control border (`line-strong`), the participant palette, the icon set (Lucide) and the branding (the grid logo with the indigo accent), all in §3.

## 9. Review checklist

For any change to the UI:

- [ ] Works with the keyboard alone. Focus is always visible, and Esc closes overlays.
- [ ] Checked in light and dark mode, at 360 px wide and at 200 % zoom.
- [ ] Nothing relies on colour alone, and contrast meets §2.
- [ ] Reversible actions can be undone. Irreversible ones ask first and say who they affect.
- [ ] Loading, empty, error and offline states are designed, not left to chance.
- [ ] The text follows §6.
- [ ] No new third-party requests, no `<style>` or `<script>` added at runtime, and the ad slot rules are kept.
- [ ] Room secrets appear only in share links and never reach a server.

## Sources

- Apple Human Interface Guidelines, used as the starting point for §1 and §5: [modality](https://developer.apple.com/design/human-interface-guidelines/modality), [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo), [loading](https://developer.apple.com/design/human-interface-guidelines/loading), [entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data), [onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [offering help](https://developer.apple.com/design/human-interface-guidelines/offering-help) and [collaboration and sharing](https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing). They were found through the [hig-patterns skill](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/hig-patterns/SKILL.md). This guide is written for the web and doesn't copy their text.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for §2.
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) for keyboard behaviour in dialogs, menus and drag and drop.
