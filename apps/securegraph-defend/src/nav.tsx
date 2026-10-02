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
    label: "Assets and exposure",
    icon: <Boxes size={17} />,
    items: [
      { to: "/assets", label: "Assets", icon: <Boxes size={17} /> },
      { to: "/assets/intelligence", label: "Asset intelligence", icon: <Activity size={17} /> },
      { to: "/assets/intelligence/graph", label: "Asset graph", icon: <Network size={17} /> },
      { to: "/posture", label: "Exposure", icon: <ShieldCheck size={17} /> },
    ],
  },
  {
    label: "Cloud",
    icon: <Cloud size={17} />,
    items: [
      { to: "/cloud", label: "Cloud posture", icon: <Cloud size={17} /> },
      { to: "/cloud-config", label: "Config changes", icon: <GitCompare size={17} /> },
    ],
  },
  {
    label: "Risk and monitoring",
    icon: <ShieldAlert size={17} />,
    items: [
      { to: "/risks", label: "Risk register", icon: <ShieldAlert size={17} /> },
      { to: "/endpoint-monitoring", label: "Endpoint monitoring", icon: <Radar size={17} /> },
    ],
  },
  {
    label: "Compliance",
    icon: <Scale size={17} />,
    items: [
      { to: "/compliance", label: "Frameworks", icon: <Scale size={17} /> },
      { to: "/compliance/questionnaire", label: "Questionnaire", icon: <ClipboardList size={17} /> },
      { to: "/compliance/gaps", label: "Gap analysis", icon: <SearchCheck size={17} /> },
      { to: "/compliance/profile", label: "Business profile", icon: <Building2 size={17} /> },
      { to: "/compliance/connectors", label: "Evidence connectors", icon: <Plug size={17} /> },
    ],
  },
  {
    label: "SOC",
    icon: <Siren size={17} />,
    items: [
      { to: "/soc", label: "SOC dashboard", icon: <Activity size={17} /> },
      { to: "/security-alerts", label: "Security alerts", icon: <Siren size={17} /> },
      { to: "/soc/war-room", label: "War room", icon: <Swords size={17} /> },
      { to: "/soc/playbooks", label: "Playbooks and MITRE", icon: <ScrollText size={17} /> },
      { to: "/soc/advisor", label: "Advisor", icon: <Shield size={17} /> },
    ],
  },
  {
    label: "Detection and logs",
    icon: <Database size={17} />,
    items: [
      { to: "/detection-packs", label: "Detection packs", icon: <Package size={17} /> },
      { to: "/soc/logs", label: "Log pipeline", icon: <Logs size={17} /> },
      { to: "/log-retention", label: "Log retention", icon: <Database size={17} /> },
      { to: "/soc/agents", label: "Agents", icon: <Activity size={17} /> },
      { to: "/soc/cloud", label: "Cloud integrations", icon: <Cloud size={17} /> },
    ],
  },
  {
    label: "Threat response",
    icon: <AlertTriangle size={17} />,
    items: [
      { to: "/alerts", label: "Incidents", icon: <AlertTriangle size={17} /> },
      { to: "/threat-intel", label: "Threat intel", icon: <Fingerprint size={17} /> },
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
