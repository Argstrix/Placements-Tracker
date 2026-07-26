import SignInButton from "../SignInButton";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="authcard">
      <p className="eye">Sign in</p>
      <h1>Welcome to Placement Tracker</h1>
      <p className="psub">
        Sign in with your VIT Google account to see companies, shortlist status, and drive timelines. Access is
        limited to current-batch (2023) vitstudent.ac.in accounts.
      </p>
      {error && (
        <div className="toast err">
          Your account isn&rsquo;t authorized. Sign-in is limited to current-batch VIT accounts.
        </div>
      )}
      <SignInButton callbackUrl={callbackUrl} />
    </div>
  );
}
