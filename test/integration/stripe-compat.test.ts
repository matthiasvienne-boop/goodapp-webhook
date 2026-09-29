// Bewijs dat de eigen handtekeningcontrole hetzelfde format spreekt als Stripe's SDK,
// in beide richtingen. Dit is de reden dat de bibliotheek zonder SDK kan.
import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { verifieerHandtekening } from "../../src/server/handtekening";
import { maakTestHandtekening } from "../../src/server/testing";

const GEHEIM = "whsec_compat";
const stripe = new Stripe("sk_test_dummy");
const payload = JSON.stringify({ id: "evt_compat", object: "event", type: "invoice.paid", data: { object: {} } });

describe("compatibiliteit met de Stripe-SDK", () => {
  it("accepteert een header die Stripe's eigen testhulp maakt", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: GEHEIM });
    expect(verifieerHandtekening(payload, header, GEHEIM).ok).toBe(true);
  });

  it("Stripe's constructEvent accepteert onze testheader", () => {
    const header = maakTestHandtekening(payload, GEHEIM);
    expect(stripe.webhooks.constructEvent(payload, header, GEHEIM).id).toBe("evt_compat");
  });

  it("weigert wat Stripe ook weigert: een andere body", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: GEHEIM });
    expect(verifieerHandtekening(payload + "x", header, GEHEIM).ok).toBe(false);
    expect(() => stripe.webhooks.constructEvent(payload + "x", header, GEHEIM)).toThrow();
  });
});
