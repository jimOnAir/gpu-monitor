# Issue tracker: Local Markdown

Issues and tasks live as local Markdown files under `.scratch/<feature-slug>/issues/`, one file per ticket, never combined. `.scratch/` is gitignored — tickets are durable working records on this machine, not pushed artifacts.

## Conventions

- **Publish a ticket**: write `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first), using the skill's per-ticket template.
- **Read a ticket**: read the file.
- **List tickets**: list the feature's `issues/` directory; filter by the `**Status:**` line.
- **Comment on a ticket**: append to a `## Comments` section at the bottom of the file.
- **Triage state**: recorded on the `**Status:**` line using the canonical roles from [triage-labels.md](triage-labels.md) (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), plus `done` when complete.
- **Close a ticket**: set `**Status:** done` and check the acceptance-criteria boxes.

## Blocking edges

Each ticket's `**Blocked by:**` line lists the ticket numbers/titles that gate it. A ticket is on the frontier when every blocker is `done`. Work tickets in dependency order.

## Pull requests as a triage surface

**no.**

## When a skill says "publish to the issue tracker"

Write one local ticket file as described above.

## When a skill says "fetch the relevant ticket"

Read the ticket file.

## Wayfinding operations

`/wayfinder` keeps its own shared map under `.wayfinder/` (local Markdown tracker). Its map and child tickets follow that skill's own conventions, not the `.scratch/` issue layout.
