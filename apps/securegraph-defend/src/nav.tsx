import React from "react";
import {
  BookOpen, Bot,
  Activity,
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardList,
  Cloud,
  Database,
  Fingerprint,
  GitCompare,
  LayoutDashboard,
  LifeBuoy,
  Logs,
  Network,
  Package,
  Plug,
  Radar,
  Scale,
  ScrollText,
  SearchCheck,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Swords,
} from "lucide-react";
import type { NavSection } from "@sg/shell/types";

/** Defend — defensive posture and continuous assurance. Each section is one
 *  sidebar group. */
export const NAV: NavSection[] = [
  {
    label: "Overview",
    icon: <LayoutDashboard size={17} />,
    items: [{ to: "/", label: "Overview", icon: <LayoutDashboard size={17} /> }],
  },
  {
    label: "Surface",
    icon: <Boxes size={17} />,
    items: [
      { to: "/assets", label: "Assets", icon: <Boxes size={17} /> },
      { to: "/assets/intelligence", label: "Insights", icon: <Activity size={17} /> },
      { to: "/assets/intelligence/graph", label: "Graph", icon: <Network size={17} /> },
      { to: "/posture", label: "Exposure", icon: <ShieldCheck size={17} /> },
    ],
  },
  {
    label: "Cloud",
    icon: <Cloud size={17} />,
    items: [
      { to: "/cloud", label: "Posture", icon: <Cloud size={17} /> },
      { to: "/cloud-config", label: "Drift", icon: <GitCompare size={17} /> },
    ],
  },
  {
    label: "Oversight",
    icon: <ShieldAlert size={17} />,
    items: [
      { to: "/risks", label: "Risks", icon: <ShieldAlert size={17} /> },
      { to: "/endpoint-monitoring", label: "Uptime", icon: <Radar size={17} /> },
    ],
  },
  {
    label: "Compliance",
    icon: <Scale size={17} />,
    items: [
      { to: "/compliance", label: "Frameworks", icon: <Scale size={17} /> },
      { to: "/compliance/questionnaire", label: "Questionnaire", icon: <ClipboardList size={17} /> },
      { to: "/compliance/gaps", label: "Gaps", icon: <SearchCheck size={17} /> },
      { to: "/compliance/profile", label: "Profile", icon: <Building2 size={17} /> },
      { to: "/compliance/connectors", label: "Collectors", icon: <Plug size={17} /> },
    ],
  },
  {
    label: "SOC",
    icon: <Siren size={17} />,
    items: [
      { to: "/soc", label: "Dashboard", icon: <Activity size={17} /> },
      { to: "/security-alerts", label: "Alerts", icon: <Siren size={17} /> },
      { to: "/soc/war-room", label: "Cases", icon: <Swords size={17} /> },
      { to: "/soc/playbooks", label: "Playbooks", icon: <ScrollText size={17} /> },
      { to: "/soc/advisor", label: "Advisor", icon: <Shield size={17} /> },
    ],
  },
  {
    label: "Telemetry",
    icon: <Database size={17} />,
    items: [
      { to: "/detection-packs", label: "Detections", icon: <Package size={17} /> },
      { to: "/soc/logs", label: "Pipeline", icon: <Logs size={17} /> },
      { to: "/log-retention", label: "Retention", icon: <Database size={17} /> },
      { to: "/soc/agents", label: "Agents", icon: <Activity size={17} /> },
      { to: "/soc/cloud", label: "Integrations", icon: <Cloud size={17} /> },
    ],
  },
  {
    label: "Response",
    icon: <AlertTriangle size={17} />,
    items: [
      { to: "/alerts", label: "Incidents", icon: <AlertTriangle size={17} /> },
      { to: "/threat-intel", label: "Intel", icon: <Fingerprint size={17} /> },
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
