"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  id: number;
  type: string;
  status: string;
  itemsScraped: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const TYPES = [
  { type: "DA", label: "DA Commodity Prices", desc: "Pull the latest DA price-monitoring PDF and store every commodity row.", chunked: false },
  { type: "RECIPES", label: "Panlasang Pinoy Recipes (ALL)", desc: "Crawl every recipe index page and store every recipe — ingredients and step-by-step instructions included. Runs one index page per request, repeated automatically until the site is exhausted.", chunked: true },
  { type: "NUTRITION", label: "FNRI Nutrition Data (ALL)", desc: "Crawl the full FNRI Food Composition Table, following every pagination link. Runs one listing page per request, repeated automatically until done.", chunked: true },
] as const;

function StatusTag({ status }: { status: string }) {
  const color =
    status === "DONE"
      ? "bg-green-100 text-green-700"
      : status === "ERROR"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{status}</span>;
}

function Section({ type, label, desc, chunked }: { type: string; label: string; desc: string; chunked: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    const res = await fetch(`/api/scrape/${type.toLowerCase()}`);
    const data: LogEntry[] = await res.json();
    setLogs(data);
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scrape/${type.toLowerCase()}`)
      .then((res) => res.json())
      .then((data: LogEntry[]) => {
        if (!cancelled) setLogs(data);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const postScrape = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch(`/api/scrape/${type.toLowerCase()}`, { method: "POST", signal: controller.signal });
      const data = await res.json();
      return { ok: res.ok, data };
    } finally {
      clearTimeout(timer);
    }
  };

  const handleRun = async () => {
    setStarting(true);
    setError(null);
    try {
      if (!chunked) {
        const { ok, data } = await postScrape();
        if (!ok) setError(data.error ?? "Failed to run scrape");
        await loadLogs();
      } else {
        let failures = 0;
        while (true) {
          try {
            const { ok, data } = await postScrape();
            if (!ok) {
              setError(data.error ?? "Failed to run scrape");
              break;
            }
            failures = 0;
            await loadLogs();
            if (data.done) break;
          } catch {
            failures++;
            await loadLogs();
            if (failures >= 5) {
              setError("Repeated request timeouts — stopped. Click Run again to resume.");
              break;
            }
            await sleep(2000);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStarting(false);
  };

  const latest = logs[0];
  const isRunning = starting;

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-bold mb-1">{label}</h2>
      <p className="text-sm text-gray-500 mb-5">{desc}</p>

      <button
        onClick={handleRun}
        disabled={isRunning}
        className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
      >
        {isRunning ? "Running... (this can take a while)" : "Run full scrape"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {latest && (
        <div className="mt-4 text-sm bg-gray-50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <StatusTag status={latest.status} />
            <span className="text-gray-500">items scraped: {latest.itemsScraped}</span>
          </div>
          <p className="text-gray-600 break-words">{latest.message ?? "—"}</p>
        </div>
      )}

      {logs.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer">History ({logs.length})</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 uppercase tracking-wide border-b">
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Items</th>
                  <th className="pb-2 pr-4">Message</th>
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4"><StatusTag status={log.status} /></td>
                    <td className="py-2 pr-4">{log.itemsScraped}</td>
                    <td className="py-2 pr-4 text-gray-500 max-w-xs truncate">{log.message ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">{new Date(log.startedAt).toLocaleString("en-PH")}</td>
                    <td className="py-2 text-gray-400 whitespace-nowrap">{log.finishedAt ? new Date(log.finishedAt).toLocaleString("en-PH") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Scraper Admin Panel</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Trigger full, uncapped scrapes that snapshot data into the database as static records.
        Each scrape runs server-side after the button click, so you can navigate away —
        progress is tracked in the log below and refreshes automatically while running.
      </p>

      <div className="space-y-6">
        {TYPES.map((t) => (
          <Section key={t.type} type={t.type} label={t.label} desc={t.desc} chunked={t.chunked} />
        ))}
      </div>
    </div>
  );
}
