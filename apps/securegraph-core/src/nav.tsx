import React from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  FileText,
  FlaskConical,
  Inbox,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Network,
  Plug,
  ScrollText,
  UserCheck,
} from "lucide-react";
import type { NavSection } from "@sg/shell/types";

/** Core — the shared security graph: overview, findings, risk, reports, AI.
 *
 *  Each section is one sidebar group: only its name shows until it is opened.
 *
 *  ``Authorizations`` is the assigned authorizer's own approval grid, so that
 *  entry is only offered to the authorizer of the organization — everyone
 *  else never sees it (and the route is guarded as well).
 */
export function coreNav({ isAuthorizer = false }: { isAuthorizer?: boolean } = {}): NavSection[] {
  const governance: NavSection = {
    label: "Governance",
    icon: <Landmark size={17} />,
    items: [
      { to: "/audit", label: "Audit trail", icon: <ScrollText size={17} /> },
      { to: "/agent-activity", label: "Agent activity", icon: <Activity size={17} /> },
    ],
  };
  if (isAuthorizer) {
    governance.items.push({ to: "/authorizations", label: "Authorizations", icon: <UserCheck size={17} /> });
  }

  return [
    {
      label: "Overview",
      icon: <LayoutDashboard size={17} />,
      items: [
        { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
        { to: "/analytics", label: "Analytics", icon: <BarChart3 size={17} /> },
      ],
    },
    {
      label: "Findings",
      icon: <KanbanSquare size={17} />,
      items: [
        { to: "/tracker", label: "Findings tracker", icon: <KanbanSquare size={17} /> },
        { to: "/findings", label: "Findings intake", icon: <Inbox size={17} /> },
        { to: "/reports", label: "Report solutions", icon: <FileText size={17} /> },
      ],
    },
    {
      label: "Security graph",
      icon: <Network size={17} />,
      items: [
        { to: "/assets", label: "Assets", icon: <Boxes size={17} /> },
        { to: "/integrations", label: "Integrations hub", icon: <Plug size={17} /> },
      ],
    },
    governance,
    {
      label: "Help and support",
      icon: <LifeBuoy size={17} />,
      items: [
        { to: "/assistant", label: "Assistant", icon: <Bot size={17} /> },
        { to: "/docs", label: "Documentation", icon: <BookOpen size={17} /> },
        { to: "/support", label: "Support", icon: <LifeBuoy size={17} /> },
        { to: "/sandbox", label: "Sandbox", icon: <FlaskConical size={17} /> },
      ],
    },
    {
      label: "Danger zone",
      icon: <AlertTriangle size={17} />,
      items: [
        { to: "/danger-zone", label: "Asset removal", icon: <AlertTriangle size={17} /> },
      ],
    },
  ];
}
