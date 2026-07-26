export default function SiteFooter() {
  return (
    <footer className="sitefoot">
      <p>
        <strong>Unofficial, student-built tracker.</strong> Not affiliated with, endorsed by, or operated by VIT CDC.
        Always cross-check dates, eligibility, and instructions against the original placement-cell mail shown on each
        page before acting.
      </p>
      <p>
        <strong>Access is limited to the current placement batch.</strong> Only 2023-batch VIT accounts can sign in;
        other batches and outside accounts are blocked, so company job descriptions stay within the batch they were
        shared with.
      </p>
      <p>
        <strong>Shortlist matching never stores a Neo ID.</strong> It uses irreversible one-way fingerprints of the
        IDs in shortlist mails. Separately, you can choose to save your own Neo ID to your account, encrypted,
        purely for autofill convenience — never on by default, and removable any time from your dashboard.
      </p>
    </footer>
  );
}
