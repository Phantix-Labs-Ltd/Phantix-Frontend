---
title: "The Surface You Forgot You Owned"
no: "02"
order: 2
date: "2026-09-25"
kicker: "Attack surface"
excerpt: "The riskiest asset in most estates is not the flagship app. It is the staging host that someone launched two years ago and never switched off."
featured: false
---

Ask a team to list what they expose to the internet. You will get a confident answer: the main site, the app, the API, maybe a status page. Map the estate from the outside and the list is almost always longer.

The extra entries are rarely mysterious. A marketing microsite from a campaign that ended. A staging subdomain with production data "just for testing". A forgotten `robots.txt` that politely lists the directories nobody should visit. Each one was reasonable when it was created, and each one quietly fell out of anyone's inventory.

## Assets come in families

The useful way to see an estate is as a tree, not a list. `example.com` owns its directories and its subdomains; `app.example.com` owns its own paths in turn. When a new host appears under a domain that you already own, it should inherit the scope and the ownership of that domain automatically. It should not wait in an "unknown" pile for someone to claim it.

Chaining assets this way does two things. It makes gaps obvious: a subdomain with no owner under a parent that has one stands out immediately. And it makes testing honest: if a parent is in scope, you know exactly which children came along with it.

![A parent domain with four subdomains, one of which has no owner](/blog/figures/02-asset-tree.svg)

*Figure 1. A domain owns its subdomains. One branch with no owner is the one that becomes a blind spot.*

## A short checklist

1. Pull every subdomain your certificates and DNS have ever named, not just the ones in your runbook.
2. Group them under their parent domain and give each group a single owner.
3. Retire anything no owner is willing to claim, or put it in scope and test it.

![A timeline from a campaign launch to the day the asset is found outside the inventory](/blog/figures/02-orphan-timeline.svg)

*Figure 2. A reasonable launch, and two years of quiet drift. Every step was sensible; the blind spot appeared anyway.*

The attack surface you know about is the one you have already defended. The next incident is more likely to start at the one you forgot.
