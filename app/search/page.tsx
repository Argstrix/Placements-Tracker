import ShortlistChecker from "./ShortlistChecker";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Shortlist lookup</p>
        <h1>Check shortlist</h1>
        <p>
          See which companies shortlisted you. Enter your Neo ID once — it&rsquo;s checked against stored fingerprints
          and never saved, so there&rsquo;s nothing to enter again if you leave and come back within your session.
        </p>
      </div>

      <ShortlistChecker />

      <div className="callout" style={{ marginTop: 16 }}>
        <span className="ci">i</span>
        <div>
          We don&rsquo;t store Neo IDs. Matching uses irreversible one-way fingerprints of the IDs in shortlist mails,
          so no Neo ID — yours or anyone else&rsquo;s — is ever kept in the database. Exact ID only; partial matches
          aren&rsquo;t possible.
        </div>
      </div>
    </div>
  );
}
