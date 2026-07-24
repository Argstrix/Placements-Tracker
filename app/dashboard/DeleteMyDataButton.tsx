"use client";
import { deleteMyData } from "./actions";

export default function DeleteMyDataButton() {
  return (
    <form
      action={deleteMyData}
      onSubmit={(e) => {
        if (!confirm("This removes every company you're tracking interest in. Continue?")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn danger">
        Delete my data — tracked interests
      </button>
    </form>
  );
}
