// De situaties waar audit 09 en 07 om vroegen:
//  - NEW-114: zonder secret deed de route 200 en verwerkte niets (fail-open). Nu 503.
//  - EAD-252: claim en toekenning stonden niet in een transactie; een crash ertussen
//    verloor betaalde tokens en de Stripe-retry stopte op "al geclaimd".
//  - VEY-508: de handtekening zelf werd nooit echt getest (gemockte constructEvent).
import { describe, expect, it } from "vitest";
import { verwerkWebhook, type WebhookOpties } from "../../src/server/webhook";
import { maakTestHandtekening } from "../../src/server/testing";

const GEHEIM = "whsec_test";
const NU = 1_800_000_000;
const gebeurtenis = { id: "evt_1", type: "checkout.session.completed" };
const body = Buffer.from(JSON.stringify(gebeurtenis));
const header = maakTestHandtekening(body, GEHEIM, NU);

/** Een nagebootste databank waarvan de transactie bij een fout alles terugdraait, zoals een echte. */
function fakeDb() {
  const state = { claims: new Set<string>(), tokens: 0 };
  return {
    state,
    transactie: async <R,>(werk: (tx: typeof state) => Promise<R>): Promise<R> => {
      const kopie = { claims: new Set(state.claims), tokens: state.tokens };
      try {
        return await werk(state);
      } catch (e) {
        state.claims = kopie.claims;
        state.tokens = kopie.tokens;
        throw e;
      }
    },
  };
}

function opties(db: ReturnType<typeof fakeDb>, extra: Partial<WebhookOpties<typeof gebeurtenis, typeof db.state>> = {}): WebhookOpties<typeof gebeurtenis, typeof db.state> {
  return {
    geheim: GEHEIM,
    nu: () => NU * 1000,
    transactie: db.transactie,
    claim: async (tx, e) => {
      if (tx.claims.has(e.id)) return false;
      tx.claims.add(e.id);
      return true;
    },
    verwerk: async (tx) => {
      tx.tokens += 10;
    },
    ...extra,
  };
}

describe("verwerkWebhook", () => {
  it("zonder geheim: 503 en er wordt niets verwerkt (fail-closed, niet 200)", async () => {
    const db = fakeDb();
    const uit = await verwerkWebhook(opties(db, { geheim: undefined }), body, header);
    expect(uit.status).toBe(503);
    expect(db.state.tokens).toBe(0);
    expect(db.state.claims.size).toBe(0);
  });

  it("een lege geheim-string telt als ontbrekend", async () => {
    const db = fakeDb();
    expect((await verwerkWebhook(opties(db, { geheim: "  " }), body, header)).status).toBe(503);
  });

  it("een ongeldige handtekening: 400 zonder details, niets verwerkt", async () => {
    const db = fakeDb();
    const uit = await verwerkWebhook(opties(db), body, maakTestHandtekening(body, "whsec_ander", NU));
    expect(uit.status).toBe(400);
    expect(JSON.stringify(uit.body)).not.toMatch(/whsec|hmac|onjuist/i);
    expect(db.state.tokens).toBe(0);
  });

  it("een geldige gebeurtenis: 200, geclaimd en verwerkt, precies een keer", async () => {
    const db = fakeDb();
    const uit = await verwerkWebhook(opties(db), body, header);
    expect(uit).toMatchObject({ status: 200, body: { ontvangen: true, verwerkt: true } });
    expect(db.state.tokens).toBe(10);
  });

  it("een dubbele aflevering: 200 zonder opnieuw te verwerken", async () => {
    const db = fakeDb();
    await verwerkWebhook(opties(db), body, header);
    const tweede = await verwerkWebhook(opties(db), body, header);
    expect(tweede).toMatchObject({ status: 200, body: { ontvangen: true, verwerkt: false } });
    expect(db.state.tokens).toBe(10);
  });

  it("EAD-252: faalt de verwerking na de claim, dan draait de claim mee terug en lukt de retry", async () => {
    const db = fakeDb();
    let eerste = true;
    const kapot = opties(db, {
      verwerk: async (tx) => {
        if (eerste) {
          eerste = false;
          throw new Error("crash na de claim");
        }
        tx.tokens += 10;
      },
    });
    const poging1 = await verwerkWebhook(kapot, body, header);
    expect(poging1.status).toBe(500);
    expect(db.state.claims.has("evt_1")).toBe(false);
    expect(db.state.tokens).toBe(0);

    const poging2 = await verwerkWebhook(kapot, body, header);
    expect(poging2).toMatchObject({ status: 200, body: { verwerkt: true } });
    expect(db.state.tokens).toBe(10);
  });

  it("een foutmelding lekt niets uit de fout naar de aanroeper", async () => {
    const db = fakeDb();
    const uit = await verwerkWebhook(
      opties(db, { verwerk: async () => { throw new Error("postgres://gebruiker:geheim@host/db"); } }),
      body,
      header
    );
    expect(uit.status).toBe(500);
    expect(JSON.stringify(uit.body)).not.toContain("geheim@host");
  });

  it("een body die al geparsed is (json vóór raw): 500 met een duidelijke reden, niet 400", async () => {
    const db = fakeDb();
    const uit = await verwerkWebhook(opties(db), { id: "evt_1" } as unknown as Buffer, header);
    expect(uit.status).toBe(500);
    expect(JSON.stringify(uit.body)).toMatch(/raw/i);
    expect(db.state.tokens).toBe(0);
  });

  it("een geldige handtekening over een body die geen JSON is: 400", async () => {
    const db = fakeDb();
    const rommel = Buffer.from("geen json");
    const uit = await verwerkWebhook(opties(db), rommel, maakTestHandtekening(rommel, GEHEIM, NU));
    expect(uit.status).toBe(400);
  });

  it("een gebeurtenis zonder id wordt geweigerd: zonder id valt er niets te claimen", async () => {
    const db = fakeDb();
    const zonder = Buffer.from(JSON.stringify({ type: "x" }));
    const uit = await verwerkWebhook(opties(db), zonder, maakTestHandtekening(zonder, GEHEIM, NU));
    expect(uit.status).toBe(400);
  });
});
