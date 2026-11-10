# Retro

The tech spec for `retro.teamtoolbox.org`, milestone M1. It builds on the platform in [tech-spec.md](../tech-spec.md) (rooms §6.3–6.4, privacy §5, the retro sketch §15.1) and follows the [UI guidelines](../ui-guidelines.md).

## Decisions

Settled with the product owner before building:

| Topic        | Decision                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Styles       | Start / Stop / Continue, Happy / Sad / Confused, 4Ls, Mad / Sad / Glad, Sailboat, Starfish. No custom columns in v1 |
| Writing      | Cards appear for everyone as soon as they're added                                                                  |
| Anonymity    | Cards never carry an author, before or after writing                                                                |
| Host control | Trust-based: only the host's screen shows controls. The host can hand over                                          |
| Grouping     | Everyone groups at the same time                                                                                    |
| Voting       | 3 votes per person, several can go on one topic, hidden until the host ends voting                                  |
| Timer        | For the writing phase. Soft stop: "Time's up" shows, nothing locks. The host can add time                           |
| Lifetime     | 30 days by default. The host can pick 1, 7, 30 or 90                                                                |
| Action items | Text and an optional owner from the people in the room                                                              |
| Discussion   | Topics sorted by votes. The host focuses one topic at a time on everyone's screen                                   |
| Exports      | Copy as Markdown, download JSON, and a print layout to save as PDF                                                  |

## Flow

| Step       | Host                                                                            | Everyone else                                  | Moves on when        |
| ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------- |
| 0. Create  | Picks a style, the room lifetime and their display name, then creates the retro | (Not there yet)                                | The room is created  |
| 1. Lobby   | Sees the share link and who has joined. Picks the writing time and starts       | Enter a display name and wait                  | The host starts      |
| 2. Write   | Writes too. Sees the timer, can add a minute, and moves on                      | Add cards to columns; edit or delete their own | The host moves on    |
| 3. Group   | Groups too, and moves on                                                        | Drag cards together, name groups               | The host moves on    |
| 4. Vote    | Votes too. Sees how many people have used all their votes, and moves on         | Spend 3 votes on topics                        | The host ends voting |
| 5. Discuss | Focuses topics in vote order, adds actions, exports                             | Follow the focused topic, add actions, export  | (Final step)         |

- **The host can go back** a step from the room menu. Nothing is deleted when they do: cards, groups and votes stay.
- **Joining late** is fine. People join the current step after entering their name.
- **Leaving:** if the host is offline for more than a minute, anyone can take over as host. That's in keeping with trust-based control.
- **Ending:** the room deletes itself at the end of its lifetime. The host can also delete it for everyone from the room menu, after a confirmation that names what's lost.

## Topics

A **topic** is what people vote on and discuss: either a group, or a card that isn't in a group. Groups can mix cards from different columns. A group's title is optional. Without one, the topic shows its first card's text.

## Data model

All of it lives in one room on the rooms service. Every record and presence update is end-to-end encrypted, and every decrypted payload is validated with Zod (`zod/mini`) before use. Record IDs are random and opaque, because the server sees them. A record's kind is the `k` field inside the encrypted payload.

| Kind (`k`) | One per     | Written by                       | Fields                                                                                                              |
| ---------- | ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `settings` | Room        | Creator, once                    | `template`, `createdAt`                                                                                             |
| `state`    | Room        | Host                             | `phase`, `hostId`, `timer` (`{ endsAt, durationMs }` or `null`), `focusTopicId`                                     |
| `person`   | Participant | That participant                 | `name`, `joinedAt`. The record ID is the participant ID                                                             |
| `card`     | Card        | Author (text), anyone (grouping) | `column`, `text`, `createdAt`, `groupId`                                                                            |
| `group`    | Group       | Anyone                           | `title`, `createdAt`                                                                                                |
| `ballot`   | Voter       | That voter                       | `topics` (up to 3 topic IDs, repeats allowed). The record ID is a random voter ID, separate from the participant ID |
| `action`   | Action item | Anyone                           | `text`, `ownerId`, `topicId`, `createdAt`                                                                           |

- **Presence** (per connection, small): `pid`, `name` and `typing`. It drives "who's here" and the "3 people typing" count.
- **Kept in the browser** (`localStorage` on the retro origin, which no third-party code can reach, spec §5.6):
  - your display name;
  - per room, your participant ID, your voter ID and the IDs of the cards you wrote;
  - the list of recent rooms, with their links.
- **Singletons:** if two `settings` or `state` records ever exist, everyone uses the one with the lowest record ID.

### Anonymity

- Cards have no author field. Your own cards are recognised by IDs kept in your browser, so you can only edit them from the browser you wrote them in.
- Ballots are filed under a random voter ID, so nobody can see who voted for what. Counts only show once voting ends.
- Typing shows as a count of people, not names.
- **What this doesn't hide:** someone watching closely could guess an author from when a card appears. The UI never shows names on cards, but the guarantee is about the data.

### Conflicts

- Every record is last-write-wins on the server.
- Each kind is designed so that one person writes it in a given step:
  - card text only changes during writing, and only by its author;
  - a card's group only changes during grouping;
  - each ballot belongs to one voter;
  - the state belongs to the host.
- When two people move the same card at the same moment, the last move wins, and everyone sees the result.

### Timer

- Starting the writing step with a time sets `timer.endsAt` from the host's clock. Every screen counts down to that moment on its own clock.
- Clock differences between devices of a few seconds are accepted. Anything more is a device problem, and the soft stop makes it harmless.
- "Add a minute" moves `endsAt` forward.

### Limits

- Text lengths: cards up to 280 characters, group titles 80, names 40, actions 200.
- The rooms service allows 50 people and 1,000 records per room, which is far more than a retro needs.

## Exports

From the discussion step, for everyone in the room. Nothing is uploaded: files are built in the browser.

- **Markdown**, copied to the clipboard:
  - a title with the style and date;
  - topics in vote order with their votes and cards, each card labelled with its column;
  - then the action items as a task list with owners.
- **JSON** (`teamtoolbox-retro-<date>.json`): `{ format: "teamtoolbox.retro", version: 1, exportedAt, template, columns, topics: [{ title, votes, cards: [{ column, text }] }], actions: [{ text, owner, topic }] }`.
- **PDF:** a print layout of the results that hides the app's chrome and the ad. "Save as PDF" opens the browser's print dialog.
- **No exports contain authors or voter IDs.**

## Interface

The interface follows the [UI guidelines](../ui-guidelines.md):

- **Room header:** a step indicator, the people present (participant colours in join order), the Share button and the connection state. Host controls sit at the right: the next step as the primary button, plus a room menu.
- **Phones:** columns become tabs while writing. Topics stack.
- **Grouping:** drag and drop with `@dnd-kit/core` (mouse, touch and keyboard). Every card also has a "Group with…" and a "Remove from group" action, so dragging is never required.
- **Deleting your own card** happens straight away and shows an Undo toast.
- **Deleting the room** asks for confirmation.
- **Announcements:** step changes, the timer running out and connection changes go through a polite live region.

## App and infrastructure

- `apps/retro`: React and Vite, Tailwind with the shared theme, `@teamtoolbox/ui` and `@teamtoolbox/room-client`.
- **Routes:** `/` is the start screen with recent rooms. `/room#<secret>` is a retro. Unknown paths fall back to the app.
- **Deploy:** Workers static assets on the custom domain `retro.teamtoolbox.org`.
- **CSP:** `public/_headers` with the tool-app policy from spec §10.4. `check:headers` enforces it.
- **Preview builds** talk to the staging `rooms` and `ads` services on `amoritan.workers.dev`, because production only accepts `retro.teamtoolbox.org`. The build then rewrites `dist/_headers` to allow exactly those two staging origins. Production builds are unchanged.
- **Registry:** `retro` moves from `soon` to `beta` once it's live and tried.

## Testing

- **Unit tests:** schemas, topic building, vote tallies, step rules and the exports.
- **Hook tests** with a stand-in room: fast voting (each click builds on the last, even before the server echoes it), the 3-vote limit, own-card edits, and starting a group.
- **By hand:** several browsers against the local rooms service, through every step, in light and dark mode and at phone width.
- **Later (M1 follow-up):** Playwright end-to-end tests with several users and axe checks, the last known gap in the UI guidelines.

## Not in v1

- Custom columns.
- A QR code for sharing.
- Saving results to compare with the next retro.
- Reactions on cards.
- Timers for steps other than writing.
- A "focus" mode for presenting on a shared screen.
