"use client";

import { fairerCheckin, fairerCheckout } from "./actions";

export function BoutonCheckin({ checkin_id }: { checkin_id: string }) {
  return (
    <form action={fairerCheckin}>
      <input type="hidden" name="checkin_id" value={checkin_id} />
      <button type="submit"
        className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-700">
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
        className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-700">
        🏁 Parti
      </button>
    </form>
  );
}
