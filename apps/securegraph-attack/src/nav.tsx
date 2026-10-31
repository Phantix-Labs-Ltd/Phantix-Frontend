import React from "react";
import {
  BookOpen,
  Bot,
  Braces,
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
      { to: "/pentest-scope", label: "Engagements", icon: <FileSignature size={17} /> },
      { to: "/pentest-agent", label: "Agent", icon: <Bot size={17} /> },
    ],
  },
  {
    label: "Testing",
    icon: <Radar size={17} />,
    items: [
      { to: "/scans", label: "Scans", icon: <Radar size={17} /> },
      // Endpoint inventory from each API's spec; new endpoints are flagged for testing.
      { to: "/api-endpoints", label: "API endpoints", icon: <Braces size={17} /> },
      { to: "/mobile", label: "Mobile", icon: <Smartphone size={17} /> },
      // The remediation queue is the tracker with fix guidance embedded.
      { to: "/tracker", label: "Tracker", icon: <KanbanSquare size={17} /> },
    ],
  },
  {
    label: "VAPT",
    icon: <Crosshair size={17} />,
    items: [
      { to: "/vapt", label: "Campaigns", icon: <Crosshair size={17} /> },
      { to: "/vapt/schedules", label: "Schedules", icon: <CalendarClock size={17} /> },
      { to: "/prior-reports", label: "Archive", icon: <FileText size={17} /> },
      { to: "/vapt/procedures", label: "Rulebook", icon: <BookOpen size={17} /> },
      { to: "/vapt/settings", label: "Settings", icon: <SlidersHorizontal size={17} /> },
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
