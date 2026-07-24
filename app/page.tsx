import Link from "next/link";

export default function HomePage() {
  return (
    <div className="view">
      <div className="phead">
        <p className="eye">
          <span className="live" aria-hidden="true" /> Unofficial · near real-time
        </p>
        <h1>Every placement drive and shortlist, on one board.</h1>
        <p>
          Placement-cell mail lands scattered across your inbox. This pulls each company&rsquo;s registration, shortlist
          rounds, and results into one searchable place — extracted automatically, with the original mail always one click
          away so you can verify anything yourself.
        </p>
      </div>

      <div className="formrow" style={{ marginBottom: 26 }}>
        <Link href="/companies" className="btn pri">
          Browse companies
        </Link>
        <Link href="/search" className="btn">
          Check a Neo ID
        </Link>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panelhead">
          <h3>How a drive moves</h3>
          <span className="mono">registration → result</span>
        </div>
        <div className="line">
          <div className="stnt done">
            <span className="node" />
            <div className="st">Registration</div>
            <div className="dt">drive opens</div>
          </div>
          <div className="stnt done">
            <span className="node" />
            <div className="st">Shortlist</div>
            <div className="dt">rounds &amp; IDs</div>
          </div>
          <div className="stnt next">
            <span className="node" />
            <div className="st">
              Result<span className="bnext">live</span>
            </div>
            <div className="dt">selects out</div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Search by Neo ID</h3>
          <p className="psub" style={{ marginBottom: 0 }}>
            Check any Neo ID — full or partial — against every shortlist pulled from the mails, including Excel
            attachments and IDs listed inline in the body.
          </p>
        </div>
        <div className="panel">
          <h3>Nothing hidden</h3>
          <p className="psub" style={{ marginBottom: 0 }}>
            Every extracted field sits next to the original mail. Low-confidence fields are flagged, not silently
            trusted — cross-check before you act.
          </p>
        </div>
      </div>
    </div>
  );
}
