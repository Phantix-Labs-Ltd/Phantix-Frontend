import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { usePageTitle, useNoIndex } from "../pageTitle";

export default function NotFound({ homePath = "/dashboard" }: { homePath?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  usePageTitle("Page not found");
  useNoIndex();
  // Attack, Defend and Code send "home" to "/" (their overview), Core to its
  // dashboard — name the destination the button actually goes to.
  const destination = homePath === "/dashboard" ? "dashboard" : "overview";
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-phantix-700/60 bg-phantix-900 text-gold-400">
          <Compass size={22} />
        </span>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">404</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Nothing lives at <span className="break-all font-mono text-slate-300">{pathname}</span>. The link
          may be out of date or mistyped.
        </p>
        <button onClick={() => navigate(homePath)} className="btn-primary mt-5">
          Back to {destination}
        </button>
      </div>
    </div>
  );
}
