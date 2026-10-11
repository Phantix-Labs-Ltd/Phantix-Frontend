---
title: "Fixes That Held"
no: "03"
order: 3
date: "2026-09-25"
kicker: "Remediation"
excerpt: "A closed ticket is not a closed hole. Here is what separates the fixes that stick from the ones that come back."
featured: false
---

Every team has a finding that came back. It was fixed in March and marked resolved. It reappeared in July after a refactor, a new deployment region, or a dependency upgrade that quietly reverted the change. The ticket was closed. The hole never was.

Look at the fixes that hold and ask what they have in common. The answer is less about skill than about habit.

## Retest with the original proof

A fix that holds is verified with the same request that found the problem in the first place. Not a similar request, not a general scan: the exact input, replayed against the patched system, with the result recorded next to the fix. If the proof no longer works, the fix is real. If it still works, nobody has to find out the hard way.

![A closed loop: fix, retest with the original proof, keep a regression test, mark the fix as held](/blog/figures/03-retest-loop.svg)

*Figure 1. A ticket closes on trust. A fix closes on proof, and the loop repeats.*

## Fix the class, not the instance

A single unescaped parameter is rarely alone. Durable fixes address the pattern. Examples: an input validator applied at the framework layer, a header set in shared middleware, or a permission check moved from one handler into the router. One change, and the whole family of findings closed with it.

![An instance fix leaves four sibling findings open; a class fix closes all five](/blog/figures/03-fix-the-class.svg)

*Figure 2. Fix the instance and the siblings survive. Fix the class and the family closes together.*

## Keep the regression test

Finally, a fix that holds leaves something behind: a test in the pipeline that fails if the vulnerable behavior ever returns. It costs a few minutes to write and it turns a one-off repair into a permanent guarantee.

> A fix you have not retested is a hope with a ticket number.

If your tracker can show when each finding was last proven fixed, not just when it was closed, you already know which of your fixes will hold.
