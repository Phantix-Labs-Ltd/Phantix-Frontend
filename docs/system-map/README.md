# Staging system map — published snapshot

Two stills of the **live staging deployment of the Phantix backend**, discovered from
the running system rather than drawn from a template:

- `still.svg` — the full connection graph, wide
- `still-vertical.svg` — the same graph, vertical

Every box is a unit that is actually deployed (13 engines, 7 Celery workers, 10 queues,
two Postgres stores, the AGI runner and its sandbox pool, host services, and the
components that are present but permanently dark). Every line is a declared dependency.
Dashed red lines are hops the inventory records without a confirmed live call path.

## Where the map lives

The working copy is at `staging-system-map/` in the repository root and is
**git-ignored on purpose**: it is a local analysis artifact whose captures, `data.js`
and stills are regenerated on every run, and it carries a few megabytes of raw evidence
that has no place in the frontend repository. This folder is the published output.

## Regenerating

From the repository root:

```
node staging-system-map/build.cjs        # rebuilds data.js and both stills
node staging-system-map/smoke.cjs        # asserts the renderer's invariants
cp staging-system-map/still*.svg docs/system-map/
```

The renderer is data-driven: `staging-system-map/inventory.json` is the source of
truth, so adding a runner or an engine changes the picture without touching the code.

## Reading the graph

The map is organised by **deployment boundary** (the edge, the Coolify control plane,
the backend compose project, the queue layer, the AGI stack, the sandbox network, host
services, external model endpoints, egress, and targets) rather than by a narrative
order. That is deliberate: the topology is a modular monolith with a separate agent
runner beside it, and the picture should say so.

Discovery notes, confirmed facts, and the assumptions that remain open are in the
repository's local analysis folder alongside the captures. This snapshot is the
picture, not the argument.
