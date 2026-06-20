"use client";

import { fairerCheckin, fairerCheckout } from "./actions";

export function BoutonCheckin({ checkin_id }: { checkin_id: string }) {
  return (
    <form action={fairerCheckin}>
      <input type="hidden" name="checkin_id" value={checkin_id} />
      <button type="submit"
        style={{ backgroundColor: "#2E8B7E", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
        ✅ Arrivé
      </button>
    </form>
  );
}

export function BoutonCheckout({ checkin_id }: { checkin_id: string }) {
  return (
    <form action={fairerCheckout}>
      <input type="hidden" name="checkin_id" value={checkin_id} />
      <button type="submit"
        style={{ backgroundColor: "#1B2B5E", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
        🏁 Parti
      </button>
    </form>
  );
}
