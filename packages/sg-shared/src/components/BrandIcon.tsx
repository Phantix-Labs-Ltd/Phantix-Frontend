import React from "react";
import {
  Bell, Clipboard, ClipboardCheck, Cloud, Database, FileCode, GitMerge, Globe, Key, Lock, Mail,
  MessageCircle, MessageSquare, Plug, Send, Server, Shield, Slack, Webhook, Workflow, Zap,
  type LucideIcon,
} from "lucide-react";
import { BRAND_ICONS } from "../brandIcons";

/**
 * The icon hints the integrations catalog sends (kebab-case lucide names),
 * plus a few generic ones for connectors added later. Named imports on
 * purpose: `import * as` from lucide pulled every icon (~700 KB) into the
 * integrations page. A hint missing here falls back to the plug glyph.
 */
const HINT_ICONS: Record<string, LucideIcon> = {
  bell: Bell,
  clipboard: Clipboard,
  "clipboard-check": ClipboardCheck,
  cloud: Cloud,
  database: Database,
  "file-code": FileCode,
  "git-merge": GitMerge,
  globe: Globe,
  key: Key,
  lock: Lock,
  mail: Mail,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  send: Send,
  server: Server,
  shield: Shield,
  slack: Slack,
  webhook: Webhook,
  workflow: Workflow,
  zap: Zap,
};

export interface BrandIconProps {
  /** Connector catalog key, e.g. "slack", "crowdstrike" — looked up in BRAND_ICONS. */
  connectorId?: string | null;
  /** Backend's generic icon hint (kebab-case lucide name, e.g. "clipboard-check"). */
  iconHint?: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders the connector's real brand mark when one exists (simple-icons match
 * against the backend catalog — see brandIcons.ts), falls back to the generic
 * lucide icon the backend already hints at per-connector, and falls back
 * again to a plain plug glyph if neither resolves. Brand marks render at
 * `currentColor` so they inherit whatever the caller's text color is, same as
 * any other inline icon in this codebase.
 */
export function BrandIcon({ connectorId, iconHint, size = 16, className }: BrandIconProps) {
  const brand = connectorId ? BRAND_ICONS[connectorId] : undefined;
  if (brand?.path) {
    return (
      <svg
        role="img"
        aria-label={brand.name}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        className={className}
      >
        <path d={brand.path} />
      </svg>
    );
  }

  const Hinted = iconHint ? HINT_ICONS[iconHint.trim().toLowerCase().replace(/[_\s]+/g, "-")] : undefined;
  if (Hinted) return <Hinted size={size} className={className} />;

  return <Plug size={size} className={className} />;
}

export default BrandIcon;
