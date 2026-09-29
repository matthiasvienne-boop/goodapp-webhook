# Changelog

## 0.1.0 — 2026-09-30

Eerste versie (PLAT-209, masterplan audit 12, WP-15). Geen product gebruikt dit nog.

### Added

- `verwerkWebhook(opties, ruweBody, handtekeningHeader)` en `expressWebhookHandler(opties)`: handtekening controleren, **503 zonder geheim** (fail-closed, niet 200), claim en verwerking in **één transactie** (faalt de verwerking, dan draait de claim mee terug), 500 met een duidelijke reden als `express.json` de body al heeft geparsed.
- `verifieerHandtekening` — Stripe-compatibele HMAC-controle, constant-time, meerdere `v1`, tolerantie voor replay. Bewezen compatibel met de Stripe-SDK in beide richtingen.
- `@goodapp/webhook/testing`: `maakTestHandtekening` voor een echte header in tests.

### Niet meegenomen (bewust)

Geen tabel, geen databankdriver, geen Stripe-SDK-afhankelijkheid, geen gedeelde gebeurtenissenlog en geen centrale webhookdienst. Zie README.
