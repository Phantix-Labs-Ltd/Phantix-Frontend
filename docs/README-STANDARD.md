# README standard

Every application and repository README uses this structure. The structure is
the same everywhere; the content is specific to the application. A reader who
knows one README can find the same fact in any other.

This covers repository and application READMEs: the frontend apps, the shared
package, the Platform, the staff portal, and the backend services. The backend
keeps the same page at `docs/09-handbook/README-STANDARD.md`; change both copies
together. Product how-tos follow [DOCUMENTATION-STANDARD.md](DOCUMENTATION-STANDARD.md) instead.

---

## 1. Section order

| Order | Section | Required | Contents |
| --- | --- | --- | --- |
| 1 | `# <Name>` | yes | The name people use for it, then one sentence: what it is and who uses it. |
| 2 | Facts table | yes | `Live`, `Users`, `Part of`, `Stack`, `Local`, `Deploys to`. Write `None` rather than drop a row. |
| 3 | `## What it does` | yes | Its real areas, each with the route, endpoint or command that reaches it. |
| 4 | `## How it fits` | yes | What it talks to, how it signs in, and what depends on it. A small diagram when it helps. |
| 5 | `## Run it locally` | yes | Prerequisites, then the exact commands, then the URL or port it answers on. |
| 6 | `## Configuration` | yes | A table: `Variable`, `Default`, `Purpose`. Only variables the code reads. |
| 7 | `## Project layout` | yes | A tree of the folders that matter, one comment each. |
| 8 | `## Checks` | yes | The commands CI runs, in the order it runs them, plus how to run the tests. |
| 9 | `## Deploy` | yes | How a change reaches production: trigger, target, and anything manual. |
| 10 | `## Related` | yes | Links to sibling READMEs, design docs and runbooks. |

A section with nothing to say states that in one line (for example, "No
configuration: hosts are resolved in `src/config.ts`."). Do not drop it.

---

## 2. Facts table

```markdown
| | |
| --- | --- |
| **Live** | https://attack.phantixlabs.com |
| **Users** | Operators running penetration tests and VAPT campaigns |
| **Part of** | Phantix-Frontend monorepo, `apps/securegraph-attack` |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS |
| **Local** | http://localhost:5175 |
| **Deploys to** | Vercel, on push to `main` |
```

---

## 3. Rules

- **Specific, not generic.** Every sentence must be true of this application and
  false of at least one sibling. "Built with React" alone says nothing; name what
  the app does that the others don't.
- **Only what the code does.** Name real routes, endpoints, files, variables and
  commands. Check them against the code before writing. No roadmap items.
- **Commands work as written.** Copy-paste from the repository root or the
  stated directory, with no hidden setup.
- **One fact, one place.** Link to a design doc rather than copying it. A README
  says where the detail lives.
- **Plain English.** Short sentences, present tense, no marketing language, no
  emoji. The terminology in DOCUMENTATION-STANDARD.md applies.
- **Keep it current.** A change that adds a route, variable, port or deploy step
  updates the README in the same pull request.
