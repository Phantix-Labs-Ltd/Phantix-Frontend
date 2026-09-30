---
title: "Fixes That Held"
no: "03"
order: 3
date: "September 2026"
kicker: "Remediation"
excerpt: "A closed ticket is not a closed hole. This week, we look at what separated the fixes that stuck from the ones that came back."
featured: false
---

Every team has a finding that came back. It was fixed in March and marked resolved. It reappeared in July after a refactor, a new deployment region, or a dependency upgrade that quietly reverted the change. The ticket was closed. The hole never was.

This week we looked at the fixes that held and asked what they had in common. The answer was less about skill than about habit.

## Retest with the original proof

The fixes that held were all verified with the same request that found the problem in the first place. Not a similar request, not a general scan: the exact input, replayed against the patched system, with the result recorded next to the fix. If the proof no longer works, the fix is real. If it still works, nobody has to find out the hard way.

## Fix the class, not the instance

A single unescaped parameter is rarely alone. The durable fixes addressed the pattern. Examples: an input validator applied at the framework layer, a header set in shared middleware, or a permission check moved from one handler into the router. One change, and the whole family of findings closed with it.

## Keep the regression test

Finally, the fixes that held left something behind: a test in the pipeline that fails if the vulnerable behavior ever returns. It costs a few minutes to write and it turns a one-off repair into a permanent guarantee.

> A fix you have not retested is a hope with a ticket number.

If your tracker can show when each finding was last proven fixed, not just when it was closed, you already know which of your fixes will hold.
