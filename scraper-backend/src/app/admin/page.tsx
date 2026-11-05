"use client";

import { useEffect, useRef, useState } from "react";

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
  { type: "DA", label: "DA Commodity Prices (30 days)", desc: "Backfill the last 30 days of DA Daily Price Index PDFs and store every commodity row per day. Runs one day per request, repeated automatically.", chunked: true },
  { type: "RECIPES", label: "Panlasang Pinoy Recipes (ALL)", desc: "Crawl every recipe index page and store every recipe — ingredients and step-by-step instructions included. Runs one index page per request, repeated automatically until the site is exhausted.", chunked: true },
  { type: "STRUCTURED", label: "Panlasang Pinoy Structured Data (backfill)", desc: "Re-read every stored recipe's page for what the first crawl didn't keep: course, cuisine, yield, Panlasang Pinoy's own nutrition estimate and ingredient group headings (marinade, breading). Only reads recipes not read yet, about 40 seconds per request, repeated automatically.", chunked: true },
  { type: "PSA", label: "PSA Monthly Retail Prices (NCR)", desc: "Import the Philippine Statistics Authority's monthly palengke prices for Metro Manila (OpenSTAT): seafood, offal and vegetables DA doesn't list. One request, about 20 seconds; also runs weekly on its own.", chunked: false },
  { type: "NUTRITION", label: "FNRI Nutrition Data (ALL)", desc: "Crawl the full FNRI Food Composition Table, following every pagination link. Runs one listing page per request, repeated automatically until done.", chunked: true },
  { type: "SM", label: "SM Markets Prices (ALL)", desc: "Crawl the full SM Markets (smmarkets.ph) catalog via its Magento GraphQL API and snapshot today's price for every product. Runs one category page per request, repeated automatically until done.", chunked: true },
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
    const res = await fetch(`/api/scrape/${type.toLowerCase()}`, { headers: { "x-admin-token": readAdminToken() } });
    const body: unknown = await res.json();
    // Logs are admin-only: a 401 (no or wrong token) shows as an empty list.
    const data: LogEntry[] = Array.isArray(body) ? body : [];
    setLogs(data);
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scrape/${type.toLowerCase()}`, { headers: { "x-admin-token": readAdminToken() } })
      .then((res) => res.json())
      .then((data: unknown) => {
        if (!cancelled) setLogs(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type]);

  const postScrape = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch(`/api/scrape/${type.toLowerCase()}`, {
        method: "POST",
        headers: { "x-admin-token": readAdminToken() },
        signal: controller.signal,
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
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
          let transient = false;
          try {
            const { ok, status, data } = await postScrape();
            if (status === 401) {
              setError(data.error ?? "Admin token missing or wrong.");
              break;
            }
            if (ok) {
              failures = 0;
              setError(null);
              await loadLogs();
              if (data.done) break;
              continue;
            }
            // Server returned a recoverable error (timeout/rate-limit) — the
            // crawl keeps its cursor, so back off and retry from where it left off.
            transient = true;
            setError((data.error ?? "Request failed") + " — retrying...");
          } catch {
            transient = true;
            setError("Request timed out — retrying...");
          }
          if (transient) {
            failures++;
            await loadLogs();
            if (failures >= 6) {
              setError("Repeated failures — stopped. Click Run again to resume where it left off.");
              break;
            }
            await sleep(3000 * failures);
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

const TOKEN_KEY = "adminToken";

// Kept for this tab only (sessionStorage), so it is gone when the tab closes. In-memory copy,
// so the token still works for this page view when storage is blocked.
let memoryToken = "";

function readAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function AdminTokenField() {
  // Uncontrolled input filled after mount: sessionStorage isn't available during SSR.
  const ref = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (ref.current) ref.current.value = readAdminToken();
    try {
      localStorage.removeItem(TOKEN_KEY); // older versions kept it for good
    } catch {
      // storage blocked: nothing was kept
    }
  }, []);
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm mb-8">
      <span className="font-medium text-gray-700">Admin token</span>
      <input
        id="admin-token"
        type="password"
        ref={ref}
        defaultValue=""
        onChange={(e) => {
          memoryToken = e.target.value;
          try {
            sessionStorage.setItem(TOKEN_KEY, e.target.value);
          } catch {
            // storage blocked: memoryToken still covers this page view
          }
          setSaved(e.target.value.length > 0);
        }}
        placeholder="Required once ADMIN_TOKEN is set in Vercel"
        className="border rounded-lg px-3 py-1.5 min-w-0 flex-1"
      />
      <span className="text-xs text-gray-500 w-full">
        {saved ? "✓ Saved. No need to press Enter: the Run buttons use it." : "Saved automatically as you type."}
      </span>
    </label>
  );
}

interface VisitStats {
  today: string;
  users: { today: number; last7: number; last30: number; allTime: number };
  visitsToday: number;
  newToday: number;
  returningToday: number;
  daily: { day: string; users: number; visits: number }[];
  cities: { city: string; region: string; country: string; users: number }[];
  countries: { country: string; users: number }[];
  ages?: { age: string; users: number }[];
}

const AGE_LABELS: Record<string, string> = { child: "12 or under", teen: "13–17", young: "18–29", adult: "30–44", midlife: "45–59", senior: "60 and over", unknown: "Didn't say" };

/** Users counted by IP (stored only as a salted hash), from /api/visit. */
function Visitors() {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    const res = await fetch("/api/visit", { headers: { "x-admin-token": readAdminToken() } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.users) return setError(data?.error ?? `HTTP ${res.status}`);
    setStats(data);
  }
  const max = Math.max(1, ...(stats?.daily.map((d) => d.users) ?? [1]));
  return (
    <section className="bg-white rounded-xl border p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold">Users (by IP address)</h2>
        <button onClick={load} className="px-4 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold">{stats ? "Refresh" : "Show"}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
            {[["Today", stats.users.today], ["Last 7 days", stats.users.last7], ["Last 30 days", stats.users.last30], ["All time", stats.users.allTime]].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3">
                <p className="text-2xl font-bold">{Number(n).toLocaleString()}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Today: {stats.newToday} new, {stats.returningToday} returning, {stats.visitsToday} visits.
          </p>
          <div className="flex items-end gap-0.5 h-24 mb-1" aria-label="Users per day, last 30 days">
            {stats.daily.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.users} users, ${d.visits} visits`} className="flex-1 bg-green-600 rounded-t" style={{ height: `${(d.users / max) * 100}%`, minHeight: d.users ? 2 : 0 }} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mb-4">Users per day, last 30 days (Manila time)</p>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold mb-1">Top cities (30 days)</h3>
              <ul>{stats.cities.map((c) => <li key={`${c.city}-${c.region}-${c.country}`} className="flex justify-between border-t py-1"><span>{c.city}{c.region ? `, ${c.region}` : ""} · {c.country}</span><span>{c.users}</span></li>)}</ul>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Countries (30 days)</h3>
              <ul>{stats.countries.map((c) => <li key={c.country} className="flex justify-between border-t py-1"><span>{c.country}</span><span>{c.users}</span></li>)}</ul>
            </div>
          </div>
          {stats.ages && stats.ages.length > 0 && (
            <div className="text-sm mt-4">
              <h3 className="font-semibold mb-1">Age brackets (30 days)</h3>
              <ul>{stats.ages.map((a) => <li key={a.age} className="flex justify-between border-t py-1"><span>{AGE_LABELS[a.age] ?? a.age}</span><span>{a.users}</span></li>)}</ul>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Each IP address is stored only as a salted hash, never as the address itself.</p>
        </>
      )}
    </section>
  );
}

interface FeedbackRow {
  id: number;
  kind: string;
  rating: number | null;
  message: string;
  name: string | null;
  contact: string | null;
  page: string | null;
  createdAt: string;
}

/** Reviews and suggestions sent from the site's 💬 dialog. */
function FeedbackList() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    const res = await fetch("/api/feedback", { headers: { "x-admin-token": readAdminToken() } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return setError(data?.error ?? `HTTP ${res.status}`);
    setRows(data);
  }
  const rated = rows?.filter((r) => r.rating) ?? [];
  const avg = rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length : null;
  return (
    <section className="bg-white rounded-xl border p-5 mt-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold">Reviews and suggestions</h2>
        <button onClick={load} className="px-4 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold">{rows ? "Refresh" : "Show"}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && (
        <p className="text-sm text-gray-500 mb-3">
          {rows.length} messages{avg != null ? ` · ★ ${avg.toFixed(1)} average from ${rated.length} reviews` : ""}
        </p>
      )}
      <ul className="space-y-3">
        {rows?.map((r) => (
          <li key={r.id} className="border-t pt-3 text-sm">
            <p className="text-xs text-gray-500">
              {new Date(r.createdAt).toLocaleString("en-PH")} · {r.kind}
              {r.rating ? ` · ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}` : ""}
              {r.page ? ` · from ${r.page}` : ""}
            </p>
            <p className="whitespace-pre-wrap mt-1">{r.message}</p>
            {(r.name || r.contact) && <p className="text-xs text-gray-600 mt-1">— {[r.name, r.contact].filter(Boolean).join(" · ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Scraper Admin Panel</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Trigger full, uncapped scrapes that snapshot data into the database as static records.
        Scrapes run in small steps driven by this page, so keep this tab open until a run says DONE.
        If you close it, press Run again and it resumes where it stopped.
      </p>

      <AdminTokenField />

      <Visitors />

      <div className="space-y-6">
        {TYPES.map((t) => (
          <Section key={t.type} type={t.type} label={t.label} desc={t.desc} chunked={t.chunked} />
        ))}
      </div>

      <FeedbackList />
    </div>
  );
}
