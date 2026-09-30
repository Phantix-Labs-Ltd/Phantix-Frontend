import { Link, useLocation } from "react-router-dom";
import { track } from "../lib/analytics";
import { ISSUE } from "../lib/config";

export function Header() {
  const { pathname } = useLocation();
  const onPost = pathname.startsWith("/posts/");

  return (
    <header className="site-header">
      <Link className="site-brand" to="/" aria-label="The SecureGraph Weekly: the issue for this week">
        {/* Shared brand lockup: the same /logo-white.svg the operator apps
            render on dark surfaces. */}
        <img className="site-brand-logo" src="/logo-white.svg" alt="SecureGraph" />
        <span className="site-brand-issue">The Weekly</span>
      </Link>
      <nav className="site-nav" aria-label="The Weekly">
        {onPost && (
          <Link className="site-nav-link" to="/">
            ← The issue for this week
          </Link>
        )}
        <a
          className="site-nav-link site-nav-cta"
          href={ISSUE.newsletterUrl}
          onClick={() => track({ type: "subscribe_click" })}
        >
          Subscribe
        </a>
      </nav>
    </header>
  );
}
