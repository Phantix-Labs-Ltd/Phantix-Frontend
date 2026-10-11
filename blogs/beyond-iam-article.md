# Identity Is Not Enough: Controlling What AI Agents Do With the Access You Give Them

*A short guide to our research paper, "Beyond IAM: A Framework for Context-Aware, Intent-Bound, and Capability-Based Control of Autonomous AI Agents."*

Picture a security operations agent with a sensible role. It can read logs, disable user accounts, isolate endpoints and change firewall rules. Those are the actions an incident responder needs, so the role was approved.

Today the agent has one job: investigate a burst of suspicious logins. For that it needs to read logs, read identity events and write up a finding. It does not need to disable anyone.

Halfway through, the agent reads a log entry that an attacker planted. The entry contains an instruction, phrased as an operator note, to disable a list of accounts "to contain the incident". The agent follows it. Every identity check passes: the agent is authenticated, its role allows the action, and the request is well formed. The access control system did exactly what it was built to do, and the outcome is still wrong.

That gap is the subject of our paper.

## The question IAM was never asked

Identity and Access Management answers a stable set of questions. Who is this principal? Have they authenticated? What role do they hold? What resources can they reach? Has authority been delegated to them?

Those questions assume that software logic decides how granted authority gets used. A conventional service that isolates an endpoint does so because a developer wrote `IF severity == "critical" THEN isolate(endpoint)`. The decision path was fixed when the code shipped.

An AI agent decides its path at run time. It receives a broad objective, gathers context, plans, picks tools, and changes the plan as it learns. The path from objective to action is partly unknown when the agent is deployed. So the security question changes from:

> Does this principal possess permission to perform this action?

to:

> Should this particular agent execution exercise this authority, against this target, at this time, for this objective, given the context that influenced its decision?

The paper calls this shift a move from identity-centric access control to **authorized agency**. IAM still matters. It remains the root of identity, authentication and delegation. But identity alone cannot tell you whether an action is appropriate.

## Three controls that close the gap

The paper proposes three complementary controls. None of them replaces IAM; each one narrows the authority that IAM grants.

**Context-aware authorization.** An agent's decisions are shaped by what it reads. An instruction from the user who started the task is not the same as text inside a tool result, a retrieved web page or a log line. The authorization decision should know where the influencing context came from and how far to trust it. In the example above, the instruction came from untrusted data, and that alone should have stopped the action.

**Intent-bound control.** Here the paper is deliberately narrow. Intent is not a guess about what a model "really meant". It is a **declared, constrained and auditable objective** that each proposed action is checked against. If the objective is "investigate suspicious login activity", then reading identity logs, querying threat intelligence and writing a finding are in scope. Disabling all users, exporting the customer database or changing the firewall are not automatically allowed. The objective limits the authority available to the run.

**Capability-based authority.** Instead of holding a broad standing role, the agent requests a narrow capability for a specific action: this action, on this target, for this objective, used at most once, valid for ten minutes, with approval if the action is destructive. Capability systems and constructions such as Macaroons, whose caveats can only narrow a credential and never widen it, show how this can work.

## The agent run is the subject

A practical consequence is that the paper treats each **agent run**, a bounded execution tied to one objective, as a first-class security subject, not just the persistent agent behind it. Two runs of the same agent with different objectives should hold different authority.

The same idea governs delegation. When an agent hands work to a sub-agent or to another agent, authority should attenuate at every hop. A child can receive less than its parent, never more, and every delegation leaves a traceable chain back to the human or organization that owns the authority.

## The Agent Action Envelope

To make these checks concrete, the paper proposes the **Agent Action Envelope (AAE)**: an authorization object that binds everything needed to judge one meaningful action.

![The Agent Action Envelope binds identity, delegation, objective, context provenance, requested capability and constraints to a specific action](<IAM limitations in Agentic access control/agent_action_envelope.svg>)

*Figure 1. The Agent Action Envelope: the record an authorization engine evaluates before an agent acts.*

An envelope names the principal who owns the authority, the agent and the specific run, the delegation chain, the authorized objective, the provenance of the context that shaped the request, the capability requested, the target, the constraints such as time limits, usage limits and approvals, and the evidence captured for the decision. An action without a valid envelope does not happen.

## Where to enforce it: the tool boundary

Agents act on the world through tools, and protocols such as the Model Context Protocol (MCP) make that boundary explicit. That makes it the natural place to enforce authority. The paper's central principle for this boundary is simple:

> **The LLM should request authority rather than permanently possess broad authority.**

![A proposed action passes from the agent through an authorization engine and capability broker before a narrow, single-use credential reaches the MCP gateway](<IAM limitations in Agentic access control/mcp_action_boundary.svg>)

*Figure 2. MCP as the agent-to-tool action boundary: the agent proposes, a policy engine decides, and only a narrow credential reaches the tool.*

## Putting it together: the CIBC framework

The paper combines these ideas into a framework called **Context-Aware, Intent-Bound Capability Control (CIBC)**. Every authorization decision passes through six layers: identity, delegation, objective, context trust, capability, and finally enforcement with evidence capture.

![The CIBC framework's six layers](<IAM limitations in Agentic access control/cibc_six_layers.svg>)

*Figure 3. The six CIBC layers, from identity at the base to enforcement and evidence at the point of action.*

CIBC and the AAE are original proposals. They are not existing standards, and the paper says so plainly. They build on established work: Zero Trust Architecture, attribute and context-aware authorization, OAuth delegation, proof-carrying authorization and capability systems.

## The honest limits

A framework like this creates its own problems, and the paper names them.

- **Objectives can be vague.** "Contain the security incident" can justify many actions. Someone still has to define which actions belong to containment.
- **Objectives can be attacked.** If the declared objective decides what an agent may do, an attacker will try to change the objective, its metadata or its approval state. The objective becomes a security-sensitive object in its own right.
- **Provenance is hard to track.** Context passes through tools, memory and other agents. Keeping a trustworthy record of where each instruction came from is a real engineering problem.
- **Policies can multiply.** Fine-grained, per-objective rules can grow faster than a team can review them.
- **Alignment checks are imperfect.** Deciding whether an action "fits" an objective is itself a judgment that software makes imperfectly.

## What teams can do now

You do not need the full framework to start closing the gap.

1. **Split standing roles into task-scoped capabilities.** An investigation run should not carry the authority to disable accounts.
2. **Record an objective for every agent run**, signed by the person or system that defined the task, and check actions against it.
3. **Label context by source.** Treat tool output, retrieved documents and log content as untrusted input, never as instructions.
4. **Put a policy enforcement point in front of every tool**, and make it the only path an agent has to act.
5. **Require approval for destructive actions**, and keep an evidence record of why each action was allowed.

## Read the full paper

The full paper covers the threat model, the delegation and provenance model, the reference architecture and the open research questions in detail.

[Read "Beyond IAM: A Framework for Context-Aware, Intent-Bound, and Capability-Based Control of Autonomous AI Agents"](<IAM limitations in Agentic access control/Beyond_IAM_Framework_Final.html>)
