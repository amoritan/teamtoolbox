---
name: ui-guidelines
description: teamtoolbox's UI and interaction rules. Use before designing, building or reviewing anything people see in apps/home, a tool app (apps/<slug>) or packages/ui, including layout, components, dialogs, feedback and toasts, undo and confirmation, loading states, forms, drag and drop, charts, colour and tokens, accessibility and UI text.
---

# teamtoolbox UI guidelines

The rules live in [docs/ui-guidelines.md](../../../docs/ui-guidelines.md). That file is the source of truth, and this skill only points to it. Read it before writing or reviewing UI.

How to use it:

1. Read the principles (§1) and the accessibility baseline (§2), then the pattern sections in §5 that match the task.
2. Reuse what `packages/ui` already has (§7). New shared components follow the patterns they implement, and go in `packages/ui` only under the rule in §7.
3. Respect the hard limits from the spec, which the guide summarises: no third-party requests from tool pages, no `<style>` or `<script>` added at runtime (the CSP blocks them), and the ad slot rules.
4. Before finishing, go through the review checklist (§9). Check light and dark mode, 360 px wide and keyboard-only use in the browser preview.
5. If the guide doesn't cover a case, follow its principles and propose an addition to `docs/ui-guidelines.md` in the same change. If what you build closes one of the known gaps (§8), update that list too.
