import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, ClipboardList, Clock, Flag, Info, Keyboard, Layers,
  ListChecks, Loader2, RefreshCw, UserCheck, Users,
} from "lucide-react";
import { Card, EmptyState, ErrorState, Modal, PageHeader, ProgressBar, RiskBadge, PageBodySkeleton } from "@sg/ui";
import { useStore } from "@sg/store";
import { ApiError } from "@sg/api";
import {
  ANSWER_CHOICES,
  EMPTY_PROGRESS,
  loadQuestionnaire,
  rebuildQuestionnaire,
  startAnswererSession,
  submitAnswer,
  type AnswererAudit,
  type QuestionnaireList,
  type QuestionnaireQuestion,
} from "@sg/complianceGrc";
import { cx, humanize } from "@sg/utils";
import DocLink from "@sg/components/DocLink";

// ── Compliance questionnaire, run like a test ────────────────────────────────
// The merged GRC question set for the frameworks that apply to this org,
// presented the way a learning platform presents an assessment:
//   start   → what is in it, how long it takes, and the role you answer as
//   test    → one question at a time, a navigator of every question by section,
//             flags for review, notes, guidance and keyboard shortcuts
//   review  → results by section, flagged items, and where to go next
// The server refuses answers until the user declares a role, because every
// answer is attributed to person *and* role for the audit trail. Answers save
// the moment they are chosen; nothing waits for a final submit.

const ROLE_SUGGESTIONS = ["CISO", "IT Admin", "Compliance Officer", "Security Engineer", "CTO", "DPO"];
const SECONDS_PER_QUESTION = 30;
const FLAG_KEY = "sg.questionnaire.flags";

type Choice = (typeof ANSWER_CHOICES)[number];

const OPTIONS: Record<Choice, { label: string; hint: string; key: string; tone: string; dot: string }> = {
  yes: { label: "Yes", hint: "The control is in place and works.", key: "1", tone: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400" },
  partial: { label: "Partly", hint: "Some of it is in place, or it is not consistent.", key: "2", tone: "border-severity-medium/50 bg-severity-medium/10 text-severity-medium", dot: "bg-severity-medium" },
  no: { label: "No", hint: "The control is not in place.", key: "3", tone: "border-severity-critical/50 bg-severity-critical/10 text-severity-critical", dot: "bg-severity-critical" },
  na: { label: "Does not apply", hint: "This control is out of scope for us.", key: "4", tone: "border-phantix-500 bg-phantix-800/70 text-slate-300", dot: "bg-slate-500" },
};
const OPTION_ORDER: Choice[] = ["yes", "partial", "no", "na"];

const EMPTY_LIST: QuestionnaireList = {
  applicable_frameworks: [],
  total: 0,
  items: [],
  progress: EMPTY_PROGRESS,
  answer_choices: [...ANSWER_CHOICES],
  disclaimer: "",
};

type View = "start" | "test" | "review";
type NavFilter = "all" | "unanswered" | "flagged";

function readFlags(): Set<number> {
  try {
    const raw = localStorage.getItem(FLAG_KEY);
    return new Set<number>(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function writeFlags(flags: Set<number>) {
  try {
    localStorage.setItem(FLAG_KEY, JSON.stringify([...flags]));
  } catch {
    // Flags are a per-browser convenience; losing them is harmless.
  }
}

function sectionOf(q: QuestionnaireQuestion): string {
  return q.category ? humanize(q.category) : "General";
}

export default function ComplianceQuestionnaire() {
  const { toast } = useStore();
  const [data, setData] = useState<QuestionnaireList>(EMPTY_LIST);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [startingSession, setStartingSession] = useState(false);

  const [view, setView] = useState<View>("start");
  const [index, setIndex] = useState(0);
  const [navFilter, setNavFilter] = useState<NavFilter>("all");
  const [flags, setFlags] = useState<Set<number>>(() => readFlags());
  const [saving, setSaving] = useState<number | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [audit, setAudit] = useState<QuestionnaireQuestion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadQuestionnaire());
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "Your security storage is not activated yet, so questionnaire answers cannot be stored. Connect it on the Platform under Connections."
          : e instanceof Error
            ? e.message
            : "Failed to load the questionnaire.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Questions in section order, so the navigator and Next follow the same path.
  const questions = useMemo(() => {
    const items = [...data.items].sort((a, b) => sectionOf(a).localeCompare(sectionOf(b)) || a.sort_order - b.sort_order);
    return items;
  }, [data.items]);

  const sections = useMemo(() => {
    const out: { name: string; items: { q: QuestionnaireQuestion; i: number }[] }[] = [];
    questions.forEach((q, i) => {
      const name = sectionOf(q);
      let s = out.find((x) => x.name === name);
      if (!s) out.push((s = { name, items: [] }));
      s.items.push({ q, i });
    });
    return out;
  }, [questions]);

  const answeredCount = questions.filter((q) => q.my_answer).length;
  const firstUnanswered = questions.findIndex((q) => !q.my_answer);
  const current = questions[index] as QuestionnaireQuestion | undefined;

  const toggleFlag = (id: number) =>
    setFlags((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      writeFlags(next);
      return next;
    });

  const beginSession = async (then?: () => void) => {
    if (role.trim().length < 2) {
      toast("warning", "State your role", "The server records the role that you answer as. Use at least 2 characters.");
      return;
    }
    setStartingSession(true);
    try {
      const sess = await startAnswererSession(role.trim(), title.trim() || undefined);
      setSessionId(sess.id);
      setSessionRole(sess.stated_role);
      setRoleOpen(false);
      toast("success", "Role recorded", `You answer as ${sess.stated_role}. Every answer is attributed to you and this role.`);
      then?.();
    } catch (e) {
      toast(
        "error",
        "Could not start the session",
        e instanceof ApiError && e.status === 403
          ? "To answer, you need a named user session. Sign in as an organization user to continue."
          : e instanceof Error ? e.message : undefined,
      );
    } finally {
      setStartingSession(false);
    }
  };

  const startTest = () => {
    setIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    setView("test");
  };

  const goTo = (i: number) => {
    if (i < 0 || i >= questions.length) return;
    setIndex(i);
  };

  const next = () => {
    if (index >= questions.length - 1) setView("review");
    else goTo(index + 1);
  };

  const answer = async (question: QuestionnaireQuestion, value: Choice, notes?: string, advance = true) => {
    if (!sessionId) {
      setRoleOpen(true);
      return;
    }
    setSaving(question.id);
    // Show the choice at once; the reload below brings back the server's view.
    const optimistic: AnswererAudit = {
      ...(question.my_answer ?? {
        organization_user_id: null,
        answered_by_name: "You",
        answered_by_email: "",
        stated_role: sessionRole ?? "",
        stated_title: title || null,
        notes: null,
        updated_at: null,
      }),
      answer_value: value,
      notes: notes ?? question.my_answer?.notes ?? null,
    };
    setData((d) => ({ ...d, items: d.items.map((q) => (q.id === question.id ? { ...q, my_answer: optimistic } : q)) }));
    try {
      await submitAnswer({ sessionId, questionId: question.id, answerValue: value, notes });
      if (advance) next();
      // Progress, attestation score and colleagues' answers move together.
      void loadQuestionnaire().then(setData).catch(() => {});
    } catch (e) {
      toast("error", "Answer not saved", e instanceof Error ? e.message : undefined);
      void load();
    } finally {
      setSaving(null);
    }
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await rebuildQuestionnaire();
      await load();
      toast("success", "Questionnaire rebuilt", "Merged again from every applicable framework control.");
    } catch (e) {
      toast("error", "Rebuild failed", e instanceof Error ? e.message : undefined);
    } finally {
      setRebuilding(false);
    }
  };

  // Keyboard: 1-4 answer, arrows move, F flags. Ignored while typing.
  // The listener is bound once; it reads this render's state and handlers through the ref.
  const keyState = useRef({ current, view, answer, next, toggleFlag });
  keyState.current = { current, view, answer, next, toggleFlag };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { current: q, view: v, answer: doAnswer, next: doNext, toggleFlag: doFlag } = keyState.current;
      if (v !== "test" || !q) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const choice = OPTION_ORDER.find((c) => OPTIONS[c].key === e.key);
      if (choice && q.answer_type !== "free_text") {
        e.preventDefault();
        void doAnswer(q, choice);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        doNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        doFlag(q.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const p = data.progress;
  const minutesLeft = Math.max(1, Math.round(((questions.length - answeredCount) * SECONDS_PER_QUESTION) / 60));

  const roleForm = (onSubmit: () => void, submitLabel: string) => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="grc-role">Your role</label>
          <input id="grc-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="CISO" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="grc-title">Job title (optional)</label>
          <input id="grc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Head of Information Security" className="input" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ROLE_SUGGESTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cx("chip transition-colors", role === r ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-phantix-700 text-slate-400 hover:text-slate-200")}
          >
            {r}
          </button>
        ))}
      </div>
      <button onClick={onSubmit} disabled={startingSession} className="btn-primary !py-2 text-sm">
        {startingSession ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} {submitLabel}
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Compliance questionnaire"
        description="We ask and you answer. This is a self-attestation questionnaire, not a certified audit."
        actions={<>
          <DocLink docId="howto-app-24" label="Compliance review how-to" />
          {sessionId && (
            <button onClick={() => setRoleOpen(true)} className="btn-secondary text-xs" title="Change the role you answer as">
              <UserCheck size={13} /> {sessionRole}
            </button>
          )}
          <button onClick={() => void rebuild()} disabled={rebuilding} className="btn-ghost text-xs" title="Merge the questions again from your frameworks">
            {rebuilding ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rebuild
          </button>
        </>}
      />

      {loading && !data.items.length ? (
        <PageBodySkeleton stats={0} variant="section" rows={5} />
      ) : error ? (
        <ErrorState title="Questionnaire unavailable" body={error} onRetry={() => void load()} />
      ) : !questions.length ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No questions yet"
            body="Rebuild the questionnaire to merge the questions from your frameworks."
            action={<button onClick={() => void rebuild()} className="btn-primary !py-2 text-sm"><RefreshCw size={14} /> Rebuild</button>}
          />
        </Card>
      ) : view === "start" ? (
        // ── Start screen ────────────────────────────────────────────────────
        <div className="mx-auto max-w-3xl space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-400/10 text-gold-300">
                <ClipboardCheck size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-slate-100">
                  {answeredCount === 0 ? "Before you begin" : answeredCount === questions.length ? "You answered every question" : "Pick up where you left off"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  {p.applicable_frameworks.length
                    ? `The questions cover ${p.applicable_frameworks.length} framework${p.applicable_frameworks.length === 1 ? "" : "s"} that apply to your organization.`
                    : "The questions cover the frameworks that apply to your organization."}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 divide-phantix-700/40 rounded-md border border-phantix-700/40 bg-phantix-950/40 sm:grid-cols-4 sm:divide-x">
              {[
                [<ListChecks key="q" size={14} />, `${questions.length}`, "questions"],
                [<Layers key="s" size={14} />, `${sections.length}`, "sections"],
                [<CheckCircle2 key="a" size={14} />, `${answeredCount}`, "answered"],
                [<Clock key="t" size={14} />, answeredCount === questions.length ? "0" : `~${minutesLeft}`, "minutes left"],
              ].map(([icon, value, label], i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-slate-500">{icon}</span>
                  <span className="font-mono text-base font-semibold text-white">{value}</span>
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
              ))}
            </div>
            {answeredCount > 0 && (
              <div className="mt-3">
                <ProgressBar value={(answeredCount / questions.length) * 100} />
              </div>
            )}

            <ul className="mt-4 space-y-1.5 text-sm text-slate-400">
              <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />Each answer saves when you choose it. You can stop and come back at any time.</li>
              <li className="flex gap-2"><Flag size={15} className="mt-0.5 shrink-0 text-gold-300" />Not sure? Flag the question and return to it from the review screen.</li>
              <li className="flex gap-2"><Users size={15} className="mt-0.5 shrink-0 text-phantix-300" />Answers are recorded against your name and the role you state. Colleagues can answer too.</li>
            </ul>
          </Card>

          <Card>
            {sessionId ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-300">
                  You answer as <span className="font-semibold text-slate-100">{sessionRole}</span>.
                </p>
                <div className="flex gap-2">
                  {answeredCount > 0 && (
                    <button onClick={() => setView("review")} className="btn-secondary !py-2 text-sm">Review answers</button>
                  )}
                  <button onClick={startTest} className="btn-primary !py-2 text-sm">
                    {answeredCount === 0 ? "Start" : answeredCount === questions.length ? "Go through again" : "Continue"} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mb-1 font-display text-[15px] font-semibold text-slate-100">Who is answering?</h3>
                <p className="mb-3 text-sm text-slate-400">State the role you hold for these controls. It becomes part of the audit record.</p>
                {roleForm(() => void beginSession(startTest), answeredCount === 0 ? "Start the questionnaire" : "Continue the questionnaire")}
              </>
            )}
          </Card>

          {(p.disclaimer || data.disclaimer) && (
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
              <Info size={12} className="mt-0.5 shrink-0 text-gold-400" />
              {p.disclaimer || data.disclaimer}
            </p>
          )}
        </div>
      ) : view === "review" ? (
        // ── Review screen ───────────────────────────────────────────────────
        <ReviewScreen
          questions={questions}
          sections={sections}
          flags={flags}
          levelLabel={p.compliance_level?.label ?? "Not started"}
          score={p.attestation_score}
          onOpen={(i) => { setIndex(i); setView("test"); }}
          onBack={() => setView("test")}
        />
      ) : current ? (
        // ── Test view ───────────────────────────────────────────────────────
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <Navigator
            sections={sections}
            index={index}
            flags={flags}
            filter={navFilter}
            onFilter={setNavFilter}
            onGo={goTo}
            answered={answeredCount}
            total={questions.length}
            onReview={() => setView("review")}
          />

          <div className="min-w-0 space-y-3">
            <QuestionCard
              key={current.id}
              question={current}
              number={index + 1}
              total={questions.length}
              section={sectionOf(current)}
              saving={saving === current.id}
              flagged={flags.has(current.id)}
              canAnswer={Boolean(sessionId)}
              onAnswer={(v, notes, advance) => void answer(current, v, notes, advance)}
              onFlag={() => toggleFlag(current.id)}
              onShowAudit={() => setAudit(current)}
              onNeedRole={() => setRoleOpen(true)}
            />
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => goTo(index - 1)} disabled={index === 0} className="btn-ghost !py-2 text-sm disabled:invisible">
                <ArrowLeft size={14} /> Previous
              </button>
              <p className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex">
                <Keyboard size={13} /> 1 to 4 answer · arrows move · F flags
              </p>
              <button onClick={next} className="btn-secondary !py-2 text-sm">
                {index === questions.length - 1 ? "Review answers" : "Skip"} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal open={roleOpen} onClose={() => setRoleOpen(false)} title="Declare your answering role">
        <p className="mb-3 text-sm leading-6 text-slate-400">
          Answers are recorded against your name and the role you state here. Pick the role you
          actually hold for these controls. It is part of the audit record.
        </p>
        {roleForm(() => void beginSession(), sessionId ? "Change role" : "Start answering")}
      </Modal>

      <Modal open={!!audit} onClose={() => setAudit(null)} title="Who answered this" wide>
        {audit && (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-slate-300">{audit.prompt}</p>
            {!audit.my_answer && !audit.answers_from_others.length ? (
              <p className="text-xs text-slate-500">No answers recorded yet.</p>
            ) : (
              <ul className="divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40">
                {[...(audit.my_answer ? [audit.my_answer] : []), ...audit.answers_from_others].map((a, i) => (
                  <li key={`${a.answered_by_email}-${i}`} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-200">{a.answered_by_name}</span>
                      <span className={cx("chip !py-0.5", OPTIONS[a.answer_value as Choice]?.tone ?? OPTIONS.na.tone)}>
                        {OPTIONS[a.answer_value as Choice]?.label ?? a.answer_value}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-slate-500">
                      {a.stated_role}{a.stated_title ? ` · ${a.stated_title}` : ""}{a.answered_by_email ? ` · ${a.answered_by_email}` : ""}
                    </p>
                    {a.notes && <p className="mt-1 text-xs leading-5 text-slate-400">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Navigator: every question as a numbered bubble, grouped by section ──────

function Navigator({
  sections, index, flags, filter, onFilter, onGo, answered, total, onReview,
}: {
  sections: { name: string; items: { q: QuestionnaireQuestion; i: number }[] }[];
  index: number;
  flags: Set<number>;
  filter: NavFilter;
  onFilter: (f: NavFilter) => void;
  onGo: (i: number) => void;
  answered: number;
  total: number;
  onReview: () => void;
}) {
  return (
    <Card pad="sm" className="h-fit lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Progress</p>
        <p className="font-mono text-xs text-slate-300">{answered}/{total}</p>
      </div>
      <ProgressBar value={total ? (answered / total) * 100 : 0} />

      <div className="mt-3 flex gap-1" role="tablist" aria-label="Show questions">
        {(["all", "unanswered", "flagged"] as NavFilter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => onFilter(f)}
            className={cx(
              "flex-1 rounded px-1.5 py-1 text-[12px] font-medium capitalize transition-colors",
              filter === f ? "bg-phantix-800 text-slate-100" : "text-slate-500 hover:text-slate-300",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {sections.map((s) => {
          const items = s.items.filter(({ q }) =>
            filter === "all" ? true : filter === "unanswered" ? !q.my_answer : flags.has(q.id),
          );
          if (!items.length) return null;
          const done = s.items.filter(({ q }) => q.my_answer).length;
          return (
            <div key={s.name}>
              <p className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-slate-300">{s.name}</span>
                <span className="shrink-0 font-mono text-slate-500">{done}/{s.items.length}</span>
              </p>
              <div className="grid grid-cols-7 gap-1">
                {items.map(({ q, i }) => {
                  const value = q.my_answer?.answer_value as Choice | undefined;
                  const isCurrent = i === index;
                  return (
                    <button
                      key={q.id}
                      onClick={() => onGo(i)}
                      title={`Question ${i + 1}${value ? `: ${OPTIONS[value]?.label ?? value}` : ": not answered"}${flags.has(q.id) ? ", flagged" : ""}`}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cx(
                        "relative flex h-7 items-center justify-center rounded font-mono text-[11px] transition-colors",
                        isCurrent
                          ? "bg-gold-400/20 text-gold-200 ring-1 ring-gold-400/60"
                          : value
                            ? "bg-phantix-800 text-slate-300 hover:bg-phantix-700"
                            : "border border-dashed border-phantix-700 text-slate-500 hover:border-phantix-500",
                      )}
                    >
                      {i + 1}
                      {value && <span className={cx("absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full", OPTIONS[value]?.dot)} />}
                      {flags.has(q.id) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filter !== "all" && sections.every((s) => !s.items.some(({ q }) => (filter === "unanswered" ? !q.my_answer : flags.has(q.id)))) && (
          <p className="text-xs text-slate-500">{filter === "unanswered" ? "Every question has an answer." : "No flagged questions."}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-phantix-700/40 pt-2 text-[11px] text-slate-500">
        {OPTION_ORDER.map((c) => (
          <span key={c} className="flex items-center gap-1"><span className={cx("h-1.5 w-1.5 rounded-full", OPTIONS[c].dot)} />{OPTIONS[c].label}</span>
        ))}
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-gold-400" />Flagged</span>
      </div>

      <button onClick={onReview} className="btn-secondary mt-3 w-full !py-1.5 text-xs">
        <ListChecks size={13} /> Review answers
      </button>
    </Card>
  );
}

// ── One question ─────────────────────────────────────────────────────────────

function QuestionCard({
  question, number, total, section, saving, flagged, canAnswer, onAnswer, onFlag, onShowAudit, onNeedRole,
}: {
  question: QuestionnaireQuestion;
  number: number;
  total: number;
  section: string;
  saving: boolean;
  flagged: boolean;
  canAnswer: boolean;
  onAnswer: (value: Choice, notes?: string, advance?: boolean) => void;
  onFlag: () => void;
  onShowAudit: () => void;
  onNeedRole: () => void;
}) {
  const mine = (question.my_answer?.answer_value ?? null) as Choice | null;
  const [notes, setNotes] = useState(question.my_answer?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(question.my_answer?.notes));
  const [showHelp, setShowHelp] = useState(false);
  const notesChanged = (notes || "") !== (question.my_answer?.notes ?? "");
  const isFreeText = question.answer_type === "free_text";

  const choose = (c: Choice) => {
    if (!canAnswer) return onNeedRole();
    // With an unsaved note, stay on the question so the note is not lost.
    onAnswer(c, notes.trim() ? notes : undefined, !notesChanged);
  };

  return (
    <Card className={cx(flagged && "border-gold-400/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {section} · Question {number} of {total}
        </p>
        <button
          onClick={onFlag}
          aria-pressed={flagged}
          className={cx("chip !py-0.5 transition-colors", flagged ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-phantix-700 text-slate-400 hover:text-slate-200")}
        >
          <Flag size={11} /> {flagged ? "Flagged" : "Flag for review"}
        </button>
      </div>

      <h2 className="mt-2 font-display text-lg font-semibold leading-snug text-slate-100">{question.prompt}</h2>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {question.framework_ids.map((f) => (
          <span key={f} className="chip !py-0.5 border-phantix-700 uppercase text-phantix-300">{f.replace(/_/g, " ")}</span>
        ))}
        {question.risk && <RiskBadge level={question.risk} />}
        {question.answer_count > 0 && (
          <button onClick={onShowAudit} className="chip !py-0.5 border-phantix-700 text-slate-400 hover:text-slate-200">
            <Users size={11} /> {question.answer_count} answered
          </button>
        )}
      </div>

      {question.help_text && (
        <div className="mt-3">
          <button onClick={() => setShowHelp((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300">
            <Info size={12} /> {showHelp ? "Hide guidance" : "What does this mean?"}
          </button>
          {showHelp && (
            <p className="mt-2 rounded-md border border-phantix-700/60 bg-phantix-900/60 px-3 py-2 text-[13px] leading-5 text-slate-400">{question.help_text}</p>
          )}
        </div>
      )}

      {isFreeText ? (
        <p className="mt-4 rounded-md border border-phantix-700/60 px-3 py-2 text-sm text-slate-500">
          This question takes a written answer. Written answers are not yet available on this page.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Your answer">
          {OPTION_ORDER.map((c) => {
            const o = OPTIONS[c];
            const selected = mine === c;
            return (
              <button
                key={c}
                role="radio"
                aria-checked={selected}
                onClick={() => choose(c)}
                disabled={saving}
                className={cx(
                  "group flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60",
                  selected ? o.tone : "border-phantix-700 hover:border-phantix-500 hover:bg-phantix-800/40",
                )}
              >
                <span
                  className={cx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[11px]",
                    selected ? "border-current" : "border-phantix-600 text-slate-500 group-hover:text-slate-300",
                  )}
                >
                  {selected ? <CheckCircle2 size={13} /> : o.key}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-sm font-semibold", selected ? "" : "text-slate-200")}>{o.label}</span>
                  <span className={cx("block text-xs", selected ? "opacity-80" : "text-slate-500")}>{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {!showNotes ? (
          <button onClick={() => setShowNotes(true)} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
            + Add a note or evidence reference
          </button>
        ) : (
          <div className="w-full">
            <label className="label" htmlFor={`q-notes-${question.id}`}>Note (optional)</label>
            <textarea
              id={`q-notes-${question.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Where the evidence is, who owns the control, or why it does not apply."
              className="input resize-y text-sm"
            />
            {mine && notesChanged && (
              <button onClick={() => onAnswer(mine, notes, false)} disabled={saving} className="btn-secondary mt-2 !py-1.5 text-xs">
                Save note
              </button>
            )}
          </div>
        )}
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" /> Saving</span>
        )}
      </div>

      {!canAnswer && (
        <button onClick={onNeedRole} className="mt-3 flex w-full items-center gap-2 rounded-md border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-left text-xs text-gold-200">
          <UserCheck size={13} /> Declare the role you answer as to record answers.
        </button>
      )}
    </Card>
  );
}

// ── Review: results by section, flags, and where to go next ─────────────────

function ReviewScreen({
  questions, sections, flags, levelLabel, score, onOpen, onBack,
}: {
  questions: QuestionnaireQuestion[];
  sections: { name: string; items: { q: QuestionnaireQuestion; i: number }[] }[];
  flags: Set<number>;
  levelLabel: string;
  score: number | null;
  onOpen: (i: number) => void;
  onBack: () => void;
}) {
  const count = (c: Choice) => questions.filter((q) => q.my_answer?.answer_value === c).length;
  const unanswered = questions.map((q, i) => ({ q, i })).filter(({ q }) => !q.my_answer);
  const flagged = questions.map((q, i) => ({ q, i })).filter(({ q }) => flags.has(q.id));
  const gaps = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.my_answer?.answer_value === "no" || q.my_answer?.answer_value === "partial");

  const list = (title: string, rows: { q: QuestionnaireQuestion; i: number }[], empty: string) => (
    <Card>
      <h3 className="mb-2 font-display text-[15px] font-semibold text-slate-100">{title} <span className="font-mono text-sm text-slate-500">{rows.length}</span></h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="max-h-72 divide-y divide-phantix-700/40 overflow-y-auto rounded-md border border-phantix-700/40">
          {rows.map(({ q, i }) => (
            <li key={q.id}>
              <button onClick={() => onOpen(i)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-phantix-800/40">
                <span className="w-7 shrink-0 font-mono text-xs text-slate-500">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{q.prompt}</span>
                {q.my_answer && (
                  <span className={cx("chip !py-0 shrink-0 text-[11px]", OPTIONS[q.my_answer.answer_value as Choice]?.tone)}>
                    {OPTIONS[q.my_answer.answer_value as Choice]?.label ?? q.my_answer.answer_value}
                  </span>
                )}
                <ArrowRight size={13} className="shrink-0 text-slate-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Your result</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">{levelLabel}</p>
            <p className="mt-0.5 text-sm text-slate-400">
              {score != null ? `Attestation score ${Math.round(score)}. ` : ""}
              {questions.length - unanswered.length} of {questions.length} questions answered.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onBack} className="btn-secondary !py-2 text-sm"><ArrowLeft size={14} /> Back to questions</button>
            <Link to="/compliance/gaps" className="btn-primary !py-2 text-sm">See your compliance gaps <ArrowRight size={14} /></Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 divide-phantix-700/40 rounded-md border border-phantix-700/40 bg-phantix-950/40 sm:grid-cols-5 sm:divide-x">
          {[...OPTION_ORDER.map((c) => [OPTIONS[c].label, count(c), OPTIONS[c].dot] as const), ["Not answered", unanswered.length, "bg-phantix-600"] as const].map(([label, n, dot]) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2">
              <span className={cx("h-2 w-2 rounded-full", dot)} />
              <span className="font-mono text-base font-semibold text-white">{n}</span>
              <span className="truncate text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-[15px] font-semibold text-slate-100">By section</h3>
        <ul className="divide-y divide-phantix-700/40">
          {sections.map((s) => {
            const done = s.items.filter(({ q }) => q.my_answer).length;
            const yes = s.items.filter(({ q }) => q.my_answer?.answer_value === "yes").length;
            const pct = s.items.length ? (done / s.items.length) * 100 : 0;
            return (
              <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 py-2 sm:grid-cols-[minmax(0,1fr)_12rem_6rem]">
                <span className="truncate text-sm text-slate-300">{s.name}</span>
                <span className="hidden sm:block"><ProgressBar value={pct} /></span>
                <span className="text-right font-mono text-xs text-slate-400">{done}/{s.items.length} · {yes} yes</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {list("Not answered", unanswered, "Every question has an answer.")}
        {list("Flagged for review", flagged, "You flagged no questions.")}
        {list("Answered No or Partly", gaps, "No gaps in your answers.")}
      </div>
    </div>
  );
}
