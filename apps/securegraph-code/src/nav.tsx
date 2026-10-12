import React from "react";
import {
  BookOpen, Bot, GitBranch, GitPullRequest, History, LayoutDashboard, LifeBuoy, PenTool, Plug, ShieldCheck,
  ShieldQuestion, Wrench, Workflow, Github, Gitlab, Activity,
} from "lucide-react";
import type { NavSection } from "@sg/shell/types";

/** Code — secure code review and the design-time context. Each section is one
 *  sidebar group. */
export const NAV: NavSection[] = [
  {
    label: "Overview",
    icon: <LayoutDashboard size={17} />,
    items: [{ to: "/", label: "Overview", icon: <LayoutDashboard size={17} /> }],
  },
  {
    label: "Review",
    icon: <ShieldCheck size={17} />,
    items: [
      { to: "/code-review", label: "Findings", icon: <ShieldCheck size={17} /> },
      { to: "/code-review/scans", label: "Scans", icon: <History size={17} /> },
      { to: "/code-review/repositories", label: "Repositories", icon: <GitBranch size={17} /> },
      { to: "/code-review/pull-requests", label: "Runs", icon: <GitPullRequest size={17} /> },
    ],
  },
  {
    label: "Automation",
    icon: <Workflow size={17} />,
    items: [
      { to: "/code-review/autofix", label: "AutoFix", icon: <Wrench size={17} /> },
      { to: "/code-review/continuous-pr", label: "Patches", icon: <Workflow size={17} /> },
      { to: "/cicd", label: "Pipelines", icon: <Activity size={17} /> },
    ],
  },
  {
    label: "Sources",
    icon: <GitBranch size={17} />,
    items: [
      { to: "/code-review/providers", label: "Providers", icon: <Plug size={17} /> },
      { to: "/code-review/providers/github", label: "GitHub", icon: <Github size={17} /> },
      { to: "/code-review/providers/gitlab", label: "GitLab", icon: <Gitlab size={17} /> },
      { to: "/code-review/providers/gitea", label: "Gitea", icon: <GitBranch size={17} /> },
    ],
  },
  {
    label: "Design",
    icon: <PenTool size={17} />,
    items: [
      { to: "/threat-models", label: "Threats", icon: <ShieldQuestion size={17} /> },
      { to: "/context", label: "Context", icon: <Workflow size={17} /> },
    ],
  },
  {
    label: "Help",
    icon: <LifeBuoy size={17} />,
    items: [
      { to: "/assistant", label: "Assistant", icon: <Bot size={17} /> },
      { to: "/docs", label: "Documentation", icon: <BookOpen size={17} /> },
    ],
  },
];
