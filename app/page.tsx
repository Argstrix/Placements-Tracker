import Link from "next/link";

export default function HomePage() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Placement Tracker</h1>
      <p className="text-gray-600">
        Unofficial tracker for VIT placement-cell mails — dates, eligibility, and shortlists in one place.
      </p>
      <div className="flex gap-3">
        <Link href="/companies" className="bg-black text-white rounded px-4 py-2">
          View Companies
        </Link>
        <Link href="/search" className="border rounded px-4 py-2">
          Search Neo ID
        </Link>
      </div>
    </main>
  );
}
