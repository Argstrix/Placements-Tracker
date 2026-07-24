"use client";
import { deleteMyData } from "./actions";

export default function DeleteMyDataButton() {
  return (
    <form
      action={deleteMyData}
      onSubmit={(e) => {
        if (!confirm("This clears your saved Neo ID and every company you're tracking interest in. Continue?")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn danger">
        Delete my data — Neo ID &amp; tracked interests
      </button>
    </form>
  );
}
