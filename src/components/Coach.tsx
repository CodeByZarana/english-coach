"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import styles from "./Coach.module.css";

type CorrectionResult = {
  corrected: string;
  hasIssue: boolean;
  issue: string;
  explanation: string;
  category: "grammar" | "phrasing" | "word_choice" | "filler_words" | "none";
};

type HistoryEntry = {
  id: string;
  input: string;
  result: CorrectionResult;
  timestamp: Date;
};

type VoteRecord = {
  id: string;
  vote: "up" | "down";
  input: string;
  result: CorrectionResult;
  at: string;
};

const VOTES_STORAGE_KEY = "speakwell-correction-votes";
const HISTORY_STORAGE_KEY = "speakwell-history";
const MAX_VOTE_RECORDS = 2000;
const MAX_HISTORY_ENTRIES = 25;
const MAX_LIKED_SHOWN = 8;

type PersistedHistoryRow = {
  id: string;
  input: string;
  result: CorrectionResult;
  at: string;
};

function newResultId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadVoteRecords(): VoteRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as VoteRecord[];
  } catch {
    return [];
  }
}

function getVoteForResultId(id: string): "up" | "down" | undefined {
  return loadVoteRecords().find((r) => r.id === id)?.vote;
}

function saveVoteRecord(rec: VoteRecord) {
  const prev = loadVoteRecords();
  const next = [rec, ...prev.filter((r) => r.id !== rec.id)].slice(0, MAX_VOTE_RECORDS);
  localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(next));
}

function loadPersistedHistory(): PersistedHistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PersistedHistoryRow[];
  } catch {
    return [];
  }
}

function saveHistoryRow(row: PersistedHistoryRow) {
  const prev = loadPersistedHistory();
  const next = [row, ...prev.filter((r) => r.id !== row.id)].slice(0, MAX_HISTORY_ENTRIES);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
}

function clearPersistedHistoryStorage() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }
}

function getLikedRecommendations(): VoteRecord[] {
  return loadVoteRecords()
    .filter((r) => r.vote === "up")
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, MAX_LIKED_SHOWN);
}

const CATEGORY_LABELS: Record<string, string> = {
  grammar: "Grammar",
  phrasing: "Phrasing",
  word_choice: "Word choice",
  filler_words: "Filler words",
  none: "Looks good",
};

const EXAMPLES = [
  "I didn't knew about this issue until yesterday.",
  "We should basically try to leverage the synergies.",
  "The team is very much excited about the project.",
  "I am having 5 years of experience in this field.",
  "Can you please revert back to me on this?",
];

type SpeechRecognitionType = typeof globalThis extends { SpeechRecognition: infer T } ? T : never;

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionType;
    webkitSpeechRecognition: SpeechRecognitionType;
  }
}

export default function Coach() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [animateResult, setAnimateResult] = useState(false);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | null>(null);
  const [likedRecommendations, setLikedRecommendations] = useState<VoteRecord[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      setMicAvailable(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition: any = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results as ArrayLike<SpeechRecognitionResult>)
          .map((r) => r[0].transcript)
          .join("");
        setInput(transcript);
      };

      recognition.onend = () => setListening(false);
      recognition.onerror = () => setListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
    }
  }, []);

  useEffect(() => { autoResize(); }, [input, autoResize]);

  useEffect(() => {
    if (!activeResultId) {
      setFeedbackVote(null);
      return;
    }
    setFeedbackVote(getVoteForResultId(activeResultId) ?? null);
  }, [activeResultId]);

  useEffect(() => {
    const rows = loadPersistedHistory();
    setHistory(
      rows.map((r) => ({
        id: r.id,
        input: r.input,
        result: r.result,
        timestamp: new Date(r.at),
      })),
    );
  }, []);

  useEffect(() => {
    setLikedRecommendations(getLikedRecommendations());
  }, [feedbackVote]);

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      setInput("");
      setResult(null);
      setActiveResultId(null);
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const correct = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setActiveResultId(null);
    setAnimateResult(false);

    try {
      const res = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 429) {
        setError("You've hit the hourly limit (10 corrections). Come back in a bit.");
        return;
      }
      const data: CorrectionResult = await res.json();
      const id = newResultId();
      const timestamp = new Date();
      const row: PersistedHistoryRow = {
        id,
        input: text,
        result: data,
        at: timestamp.toISOString(),
      };
      saveHistoryRow(row);
      setActiveResultId(id);
      setResult(data);
      setHistory((prev) => {
        const merged = [{ id, input: text, result: data, timestamp }, ...prev.filter((e) => e.id !== id)];
        return merged.slice(0, MAX_HISTORY_ENTRIES);
      });
      setTimeout(() => setAnimateResult(true), 10);
    } catch {
      setError("Something went wrong. Check your API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) correct(input);
  };

  const useExample = (ex: string) => {
    setInput(ex);
    setResult(null);
    setActiveResultId(null);
    textareaRef.current?.focus();
  };

  const submitFeedback = (vote: "up" | "down") => {
    if (!result || !activeResultId) return;
    const rec: VoteRecord = {
      id: activeResultId,
      vote,
      input,
      result,
      at: new Date().toISOString(),
    };
    saveVoteRecord(rec);
    setFeedbackVote(vote);
  };

  const openHistoryEntry = (entry: HistoryEntry) => {
    setInput(entry.input);
    setAnimateResult(false);
    setResult(entry.result);
    setActiveResultId(entry.id);
    setTimeout(() => setAnimateResult(true), 10);
    textareaRef.current?.focus();
  };

  const clearHistory = () => {
    clearPersistedHistoryStorage();
    setHistory([]);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <h1 className={styles.logo}>Speak<em>well</em></h1>
          <p className={styles.tagline}>Fix small mistakes. Sound more confident.</p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.inputCard}>
          <div className={styles.inputHeader}>
            <span className={styles.inputLabel}>Your sentence</span>
            {micAvailable && (
              <button
                className={`${styles.micBtn} ${listening ? styles.micActive : ""}`}
                onClick={toggleMic}
                title={listening ? "Stop recording" : "Speak your sentence"}
              >
                <MicIcon active={listening} />
                {listening ? "Listening…" : "Speak"}
              </button>
            )}
          </div>

          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => { setInput(e.target.value); setResult(null); setActiveResultId(null); }}
            onKeyDown={handleKey}
            placeholder="Type or speak a sentence in English…"
            rows={2}
            spellCheck={false}
          />

          <div className={styles.inputFooter}>
            <span className={styles.hint}>⌘ + Enter to correct</span>
            <button
              className={styles.correctBtn}
              onClick={() => correct(input)}
              disabled={!input.trim() || loading}
            >
              {loading ? <LoadingDots /> : "Correct →"}
            </button>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {result && (
          <div className={`${styles.resultCard} ${animateResult ? styles.resultVisible : ""}`}>
            {result.hasIssue ? (
              <>
                <div className={styles.resultHeader}>
                  <span className={`${styles.categoryBadge} ${styles[`cat_${result.category}`]}`}>
                    {CATEGORY_LABELS[result.category]}
                  </span>
                  <span className={styles.issueName}>{result.issue}</span>
                </div>

                <div className={styles.diff}>
                  <div className={styles.diffRow}>
                    <span className={styles.diffLabel}>Before</span>
                    <span className={styles.diffBefore}>{result.corrected !== result.corrected ? input : input}</span>
                  </div>
                  <div className={styles.diffArrow}>↓</div>
                  <div className={styles.diffRow}>
                    <span className={styles.diffLabel}>After</span>
                    <span className={styles.diffAfter}>{result.corrected}</span>
                  </div>
                </div>

                <p className={styles.explanation}>{result.explanation}</p>

                <button className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(result.corrected)}>
                  Copy corrected sentence
                </button>
              </>
            ) : (
              <div className={styles.allGood}>
                <span className={styles.checkmark}>✓</span>
                <div>
                  <strong>Looks natural.</strong>
                  <p>No issues found — this sentence sounds confident and correct.</p>
                </div>
              </div>
            )}

            <div className={styles.voteRow}>
              <span className={styles.voteLabel}>Was this helpful?</span>
              <div className={styles.voteBtns}>
                <button
                  type="button"
                  className={`${styles.voteBtn} ${feedbackVote === "up" ? styles.voteBtnActiveUp : ""}`}
                  onClick={() => submitFeedback("up")}
                  aria-pressed={feedbackVote === "up"}
                  aria-label="Thumbs up — helpful"
                  title="Helpful"
                >
                  <ThumbIcon dir="up" />
                </button>
                <button
                  type="button"
                  className={`${styles.voteBtn} ${feedbackVote === "down" ? styles.voteBtnActiveDown : ""}`}
                  onClick={() => submitFeedback("down")}
                  aria-pressed={feedbackVote === "down"}
                  aria-label="Thumbs down — not helpful"
                  title="Not helpful"
                >
                  <ThumbIcon dir="down" />
                </button>
              </div>
            </div>
            <p className={styles.voteHint}>Feedback is saved only on this device.</p>
          </div>
        )}

        <div className={styles.examples}>
          <span className={styles.examplesLabel}>Try an example</span>
          <div className={styles.exampleList}>
            {EXAMPLES.map((ex) => (
              <button key={ex} className={styles.exampleBtn} onClick={() => useExample(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div className={styles.history}>
            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>Recent corrections</h2>
              <button type="button" className={styles.historyClear} onClick={clearHistory}>
                Clear
              </button>
            </div>
            {history.map((entry) => {
              const isCurrent = Boolean(result && activeResultId && entry.id === activeResultId);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.historyEntry} ${isCurrent ? styles.historyEntryCurrent : ""}`}
                  onClick={() => openHistoryEntry(entry)}
                >
                  <span className={styles.historyInput}>{entry.input}</span>
                  <span className={styles.historyEntryMeta}>
                    {isCurrent && <span className={styles.historyCurrentBadge}>Now</span>}
                    {entry.result.hasIssue
                      ? <span className={`${styles.historyBadge} ${styles.historyBadgeIssue}`}>{entry.result.issue}</span>
                      : <span className={`${styles.historyBadge} ${styles.historyBadgeGood}`}>✓</span>
                    }
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {likedRecommendations.length > 0 && (
          <div className={styles.liked}>
            <h2 className={styles.likedTitle}>Marked helpful</h2>
            <p className={styles.likedSub}>Corrections you gave a thumbs up — tap to reopen.</p>
            <div className={styles.likedList}>
              {likedRecommendations.map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  className={styles.likedEntry}
                  onClick={() => openHistoryEntry({
                    id: rec.id,
                    input: rec.input,
                    result: rec.result,
                    timestamp: new Date(rec.at),
                  })}
                >
                  <span className={styles.likedThumb} aria-hidden>
                    <ThumbIcon dir="up" />
                  </span>
                  <span className={styles.likedBody}>
                    <span className={styles.likedLine}>
                      {rec.result.hasIssue ? rec.result.corrected : rec.input}
                    </span>
                    {rec.result.hasIssue && (
                      <span className={styles.likedMeta}>{rec.result.issue}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        Built with the Anthropic API · History and feedback are stored only in your browser
      </footer>
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" fill={active ? "currentColor" : "none"} />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function ThumbIcon({ dir }: { dir: "up" | "down" }) {
  const flip = dir === "down";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: "scaleY(-1)" } : undefined}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function LoadingDots() {
  return <span className={styles.loadingDots}><span /><span /><span /></span>;
}
