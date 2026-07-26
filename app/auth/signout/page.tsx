import SignOutButton from "../SignOutButton";

export default function SignOutPage() {
  return (
    <div className="authcard">
      <p className="eye">Sign out</p>
      <h1>Sign out of Placement Tracker?</h1>
      <p className="psub">You can sign back in any time with your VIT Google account.</p>
      <SignOutButton />
    </div>
  );
}
