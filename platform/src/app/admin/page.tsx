"use client";

import { useState, useRef } from "react";

interface LogEntry {
  id: number;
  source: string;
  status: string;
  message: string | null;
  count: number | null;
  createdAt: string;
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-lg font-bold mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-5">{desc}</p>
      {children}
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const color =
    status === "success"
      ? "bg-green-100 text-green-700"
      : status === "error"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{status}</span>
  );
}

export default function AdminPage() {
  const [daLog, setDaLog] = useState<string>("");
  const [recipeLog, setRecipeLog] = useState<string>("");
  const [nutritionLog, setNutritionLog] = useState<string>("");
  const [scoreLog, setScoreLog] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingState, setLoadingState] = useState<Record<string, boolean>>({});
  const [maxPages, setMaxPages] = useState(3);
  const [pdfDate, setPdfDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  const setLoading = (key: string, val: boolean) =>
    setLoadingState((prev) => ({ ...prev, [key]: val }));

  const loadLogs = async () => {
    const [da, rec, nut] = await Promise.all([
      fetch("/api/scrape/da").then((r) => r.json()),
      fetch("/api/scrape/recipes").then((r) => r.json()),
      fetch("/api/scrape/nutrition").then((r) => r.json()),
    ]);
    setLogs([...da, ...rec, ...nut].sort((a, b) => b.id - a.id).slice(0, 30));
  };

  const handleAutoFetchDA = async () => {
    setLoading("da", true);
    setDaLog("Fetching DA price PDF...");
    try {
      const res = await fetch("/api/scrape/da", { method: "POST" });
      const data = await res.json();
      setDaLog(data.error ? `Error: ${data.error}` : `Done! ${data.count} commodities saved.`);
      loadLogs();
    } catch (e) {
      setDaLog(`Network error: ${e}`);
    }
    setLoading("da", false);
  };

  const handleUploadDA = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setDaLog("Please select a PDF file."); return; }
    setLoading("da-upload", true);
    setDaLog("Uploading and parsing PDF...");
    const form = new FormData();
    form.append("pdf", file);
    form.append("date", pdfDate);
    try {
      const res = await fetch("/api/scrape/da", { method: "POST", body: form });
      const data = await res.json();
      setDaLog(data.error ? `Error: ${data.error}` : `Done! ${data.count} commodities saved.`);
      loadLogs();
    } catch (e) {
      setDaLog(`Upload error: ${e}`);
    }
    setLoading("da-upload", false);
  };

  const handleScrapeRecipes = async () => {
    setLoading("recipes", true);
    setRecipeLog(`Scraping up to ${maxPages} pages from Panlasang Pinoy...`);
    try {
      const res = await fetch("/api/scrape/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPages }),
      });
      const data = await res.json();
      setRecipeLog(data.error ? `Error: ${data.error}` : `Done! ${data.count} recipes saved.`);
      loadLogs();
    } catch (e) {
      setRecipeLog(`Error: ${e}`);
    }
    setLoading("recipes", false);
  };

  const handleScrapeNutrition = async () => {
    setLoading("nutrition", true);
    setNutritionLog("Scraping FNRI nutrition database and computing scores...");
    try {
      const res = await fetch("/api/scrape/nutrition", { method: "POST" });
      const data = await res.json();
      setNutritionLog(
        data.error
          ? `Error: ${data.error}`
          : `Done! ${data.nutritionCount} nutrition facts, ${data.scoredCount} recipes scored.`
      );
      loadLogs();
    } catch (e) {
      setNutritionLog(`Error: ${e}`);
    }
    setLoading("nutrition", false);
  };

  const handleRecomputeScores = async () => {
    setLoading("scores", true);
    setScoreLog("Recomputing scores for all recipes...");
    try {
      const res = await fetch("/api/scores", { method: "POST" });
      const data = await res.json();
      setScoreLog(data.error ? `Error: ${data.error}` : `Done! ${data.count} recipes scored.`);
    } catch (e) {
      setScoreLog(`Error: ${e}`);
    }
    setLoading("scores", false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Trigger data scraping, upload DA PDFs, and recompute scores.
        Run these in order: DA Prices → Recipes → Nutrition & Scores.
      </p>

      <div className="space-y-6">
        {/* Step 1: DA Prices */}
        <Section
          title="Step 1 — DA Commodity Prices"
          desc="Pull fresh market prices from the DA price monitoring PDF."
        >
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <button
              onClick={handleAutoFetchDA}
              disabled={loadingState["da"]}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              {loadingState["da"] ? "Fetching..." : "Auto-fetch from DA Website"}
            </button>
          </div>

          <div className="border-t pt-3 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Or upload PDF manually</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">PDF Date</label>
                <input
                  type="date"
                  value={pdfDate}
                  onChange={(e) => setPdfDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">PDF File</label>
                <input type="file" accept=".pdf" ref={fileRef} className="text-sm" />
              </div>
              <button
                onClick={handleUploadDA}
                disabled={loadingState["da-upload"]}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
              >
                {loadingState["da-upload"] ? "Uploading..." : "Upload & Parse"}
              </button>
            </div>
          </div>

          {daLog && (
            <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{daLog}</p>
          )}
        </Section>

        {/* Step 2: Recipes */}
        <Section
          title="Step 2 — Panlasang Pinoy Recipes"
          desc="Scrape recipes from panlasangpinoy.com. Be respectful — don't run this more than once a day."
        >
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Pages to scrape</label>
              <input
                type="number"
                min={1}
                max={20}
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value))}
                className="w-24 border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleScrapeRecipes}
              disabled={loadingState["recipes"]}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              {loadingState["recipes"] ? "Scraping... (may take several minutes)" : "Scrape Recipes"}
            </button>
          </div>
          {recipeLog && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{recipeLog}</p>
          )}
        </Section>

        {/* Step 3: Nutrition & Scores */}
        <Section
          title="Step 3 — FNRI Nutrition Data & Score Computation"
          desc="Scrape nutrition facts from FNRI FCT, then compute value scores for all recipes."
        >
          <div className="flex flex-wrap gap-3 mb-3">
            <button
              onClick={handleScrapeNutrition}
              disabled={loadingState["nutrition"]}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              {loadingState["nutrition"] ? "Running... (may take several minutes)" : "Scrape FNRI + Compute Scores"}
            </button>
            <button
              onClick={handleRecomputeScores}
              disabled={loadingState["scores"]}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              {loadingState["scores"] ? "Computing..." : "Recompute Scores Only"}
            </button>
          </div>
          {nutritionLog && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{nutritionLog}</p>
          )}
          {scoreLog && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mt-2">{scoreLog}</p>
          )}
        </Section>

        {/* Logs */}
        <Section title="Scraping Logs" desc="Recent scraping activity across all data sources.">
          <button
            onClick={loadLogs}
            className="text-sm text-green-700 underline mb-4 hover:text-green-900"
          >
            Refresh logs
          </button>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400">No logs yet — click Refresh after running a scrape.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b">
                    <th className="pb-2 pr-4">Source</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Count</th>
                    <th className="pb-2 pr-4">Message</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4 font-medium">{log.source}</td>
                      <td className="py-2 pr-4">
                        <StatusTag status={log.status} />
                      </td>
                      <td className="py-2 pr-4">{log.count ?? "—"}</td>
                      <td className="py-2 pr-4 text-gray-500 max-w-xs truncate">
                        {log.message ?? "—"}
                      </td>
                      <td className="py-2 text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-PH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
