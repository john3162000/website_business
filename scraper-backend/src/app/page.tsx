import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-3">Scraper Backend</h1>
      <p className="text-gray-600 mb-6">
        Standalone data pipeline that scrapes DA commodity prices, every Panlasang
        Pinoy recipe, and the full FNRI nutrition table into a static database snapshot.
      </p>
      <Link
        href="/admin"
        className="inline-block bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
      >
        Open Admin Panel
      </Link>
    </div>
  );
}
