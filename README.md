# @goodapp/webhook

Webhooks ontvangen voor GoodApp-producten. Een bibliotheek, geen dienst: elk product ontvangt zijn eigen webhooks met zijn eigen geheim en zijn eigen databank.

## Waarom

Acht producten ontvangen Stripe-webhooks en hebben vier verschillende manieren om "verwerk dit maar één keer" op te lossen. Ze werken, maar de details hebben echte fouten opgeleverd (audit 09, PLAT-BILL-002):

- **NEW-114:** zonder secret antwoordde de route `200` en verwerkte niets. Hier: `503`.
- **EAD-252:** claim en toekenning zaten niet in één transactie; een crash ertussen verloor betaalde tokens. Hier: één transactie.
- **VEY-508:** de handtekening werd in tests nooit echt gecontroleerd. Hier: `@goodapp/webhook/testing`.

## Gebruik

```ts
import express from "express";
import { expressWebhookHandler } from "@goodapp/webhook/server";

// De ruwe body is nodig voor de handtekening: raw VÓÓR json, alleen op dit pad.
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.post("/api/billing/webhook", expressWebhookHandler({
  geheim: process.env.STRIPE_WEBHOOK_SECRET,        // ontbreekt het: 503, niet 200
  transactie: (werk) => db.transaction(werk),       // een gegooide fout draait alles terug
  claim: async (tx, e) => {                          // true = nieuw, false = al eerder gezien
    const r = await tx.insert(stripeEvents).values({ id: e.id }).onConflictDoNothing().returning();
    return r.length > 0;
  },
  verwerk: async (tx, e) => {                        // in dezelfde transactie als de claim
    if (e.type === "checkout.session.completed") await kenTokensToe(tx, e);
  },
  log: (niveau, bericht, meta) => logger[niveau](bericht, meta),
}));
```

## Wat er gebeurt

| Situatie | Antwoord |
|---|---|
| Geen geheim ingesteld | `503` (Stripe herhaalt, en het valt op) |
| Body al geparsed (json vóór raw) | `500` met de reden |
| Ontbrekende, onleesbare, te oude of onjuiste handtekening | `400` zonder details |
| Body geen JSON of zonder `id` | `400` |
| Nieuw event, verwerkt | `200 { verwerkt: true }` |
| Al eerder gezien | `200 { verwerkt: false }`, niet opnieuw verwerkt |
| Verwerking faalt | `500`; de claim draait mee terug, dus de herhaling kan slagen |

## Testen in een product

```ts
import { maakTestHandtekening } from "@goodapp/webhook/testing";
const header = maakTestHandtekening(body, "whsec_test");   // een echte header, geen gemockte constructEvent
```

De handtekeningcontrole is bewezen compatibel met `stripe.webhooks.constructEvent` en `generateTestHeaderString` (zie `test/integration/stripe-compat.test.ts`).

## Wat het niet is

Geen tabel of databankdriver (het product levert `transactie`, `claim` en `verwerk`), geen centrale webhookdienst, geen gedeelde gebeurtenissenlog, geen ordening van events (TIME gebruikt `stripe_event_at`, FAM haalt de status opnieuw op; dat blijft in het product als het nodig is).
