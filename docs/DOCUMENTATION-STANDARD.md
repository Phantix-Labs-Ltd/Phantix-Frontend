# Documentation standard

This page is the rulebook for every document in `docs/`. It defines the section
order, the terminology, the formatting, and the level of detail. A reviewer can
check any doc against this page.

---

## 1. Section order

Every task how-to uses the same sections, in this order. Omit a section only
when the topic genuinely has no content for it.

| Order | Section | Required | Purpose |
| --- | --- | --- | --- |
| 1 | `# <App>: <Task>` | yes | Title. The app name, then the task. |
| 2 | Header block | yes | `**Where:**`, `**What:**`, `**Who:**`, `**Before you start:**` |
| 3 | Screenshot | yes | One screenshot of the page, under the header block. |
| 4 | `## Before you start` | yes | Permissions, prerequisites, limits. A list. |
| 5 | `## Process flow` | yes | One Mermaid flow diagram. |
| 6 | `## Steps` | yes | Numbered steps. Each step starts with a verb. |
| 7 | Reference | when useful | A table of fields, statuses, limits or values. |
| 8 | `## Troubleshooting` | yes | Symptom, cause, fix. A table. |
| 9 | `## Related` | yes | Links to sibling docs and the next step. |

Concept and audience guides (for example `01-what-is-securegraph.md`) use
sections 1, an opening paragraph, `## <topic>` sections, and `## Related`. They do
not use `## Steps`.

---

## 2. Header block

```markdown
# Command Centre: Launch a scan

**Where:** **Test** → **Web and API** (`/scans`)
**What:** Starts one scan job against assets in scope. One job runs at a time for each organization.
**Who:** Any operator. A write action needs operate mode.
**Before you start:** An asset is verified, and operate mode is unlocked.

![Scans](../../screenshots/app/scans.png)
```

Rules:

- Keep `**Where:**` to the navigation path and the route.
- Keep `**What:**` to two sentences or fewer.
- State the permission and the prerequisite. Do not make the reader guess.

---

## 3. Before you start

A short list of conditions. Each item is a fact the reader can check.

```markdown
## Before you start

- The asset is verified. An unverified asset is not in scope.
- Operate mode is unlocked, or an authorizer is available.
- One scan job runs at a time for each organization.
```

---

## 4. Steps

- One action per step.
- Start each step with a verb: "Select", "Open", "Enter", "Confirm".
- Keep a step to 25 words or fewer.
- Put the result of the step in the same step when the result is not obvious.
- Use a table or a list for more than 3 related values.

---

## 5. Troubleshooting

Always a table with three columns. Give the exact message when one exists.

```markdown
## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The button is disabled | Operate mode is locked | Unlock operate, or ask an authorizer |
```

---

## 6. Terminology

Use one term for one thing. The full glossary is in the STE100 contract. The
most common rules:

| Use | Do not use |
| --- | --- |
| finding | issue, bug, vuln, alert |
| vulnerability | (the weakness itself, not a finding) |
| asset | target, host, endpoint |
| fix | remediation, patch, resolve |
| sign in | log in, login |
| organization | organization, org, company |
| pull request | PR (after the first full use) |
| database | DB, datastore |
| Command Centre | command center, console |
| SecureGraph | the platform, SG |

Every abbreviation gets its full term at first use, then the abbreviation:
"vulnerability assessment and penetration testing (VAPT)".

---

## 7. Writing rules

The full rule set is ASD-STE100, held in the STE100 contract. In short:

- One idea per sentence. A procedural sentence is 20 words or fewer. A
  descriptive sentence is 25 words or fewer.
- Active voice. Passive voice only when the actor is unknown.
- Instructions start with a verb.
- No gerund as a noun, an adjective or a complex verb. "Before you start", not
  "Before starting".
- No em dash. Use a full stop, a colon, "and", "but" or "or".
- No slash. Use "and" or "or". "and/or" is the only exception.
- No contraction. Write "do not", not "do not".
- Numerals for quantities. Never change a value.
- A paragraph holds 6 sentences or fewer.
- More than 3 related items become a list or a table.
- US English: organization, analyze, behavior, prioritized, labeled, modeling.

---

## 8. Formatting

| Element | Rule |
| --- | --- |
| Heading | `#` for the title, `##` for sections, `###` only when a section needs subsections |
| Section break | `---` between top-level sections |
| Bold label | `**Where:**`, `**What:**`, `**Who:**`, `**Before you start:**`, `**Result:**` |
| Screenshot | `![Alt text](../../screenshots/<set>/<name>.png)`, directly under the header block |
| Table | Use for statuses, fields, limits and troubleshooting. Header row required. |
| Diagram | One Mermaid block per flow. Use `flowchart TD` or `flowchart LR`. |
| Inline code | Identifiers, routes, config keys, commands and values: `auto_verified`, `/scans` |
| Link | Relative file links inside the repo. `resolveDocHref` rewrites them in the app. |

---

## 9. Screenshots

- One screenshot per task page, under the header block.
- Capture the page after it loads, never a loading skeleton.
- Use the page at 1440 by 900.
- The file name matches the page. See `scripts/_screenshot-manifest-app.json`.

---

## 10. Review checklist

Before a doc is done, confirm:

- [ ] The nine sections are present, in order.
- [ ] The header block names the location, the purpose, the role and the prerequisite.
- [ ] Every sentence is 25 words or fewer.
- [ ] No em dash, no unnecessary slash, no contraction.
- [ ] One term for one thing, per the glossary.
- [ ] The screenshot file exists in `docs/screenshots/` and `public/screenshots/`.
- [ ] The `## Related` links resolve.
- [ ] Every number, price, plan name and identifier matches the product.
