import React from "react";
import {
  BookOpen,
  Bot,
  CalendarClock,
  Crosshair,
  FileText,
  FileSignature,
  KanbanSquare,
  LayoutDashboard,
  LifeBuoy,
  Radar,
  SlidersHorizontal,
  Smartphone,
  Target,
} from "lucide-react";
import type { NavSection } from "@sg/shell/types";

/** Attack — offensive workflows. Each section is one sidebar group. */
export const NAV: NavSection[] = [
  {
    label: "Overview",
    icon: <LayoutDashboard size={17} />,
    items: [{ to: "/", label: "Overview", icon: <LayoutDashboard size={17} /> }],
  },
  {
    label: "Scope",
    icon: <Target size={17} />,
    items: [
      { to: "/targets", label: "Targets", icon: <Target size={17} /> },
      { to: "/pentest-scope", label: "Pentest scope", icon: <FileSignature size={17} /> },
      { to: "/pentest-agent", label: "Pentest agent", icon: <Bot size={17} /> },
    ],
  },
  {
    label: "Testing",
    icon: <Radar size={17} />,
    items: [
      { to: "/scans", label: "Web and API", icon: <Radar size={17} /> },
      { to: "/mobile", label: "Mobile", icon: <Smartphone size={17} /> },
      // The remediation queue is the tracker with fix guidance embedded.
      { to: "/tracker", label: "Findings tracker", icon: <KanbanSquare size={17} /> },
    ],
  },
  {
    label: "VAPT",
    icon: <Crosshair size={17} />,
    items: [
      { to: "/vapt", label: "Campaigns", icon: <Crosshair size={17} /> },
      { to: "/vapt/schedules", label: "Schedules", icon: <CalendarClock size={17} /> },
      { to: "/prior-reports", label: "Prior reports", icon: <FileText size={17} /> },
      { to: "/vapt/procedures", label: "Procedures and rules", icon: <BookOpen size={17} /> },
      { to: "/vapt/settings", label: "Engine settings", icon: <SlidersHorizontal size={17} /> },
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
