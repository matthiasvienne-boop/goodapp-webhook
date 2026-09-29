// Webhook ontvangen: handtekening, fail-closed, en claim plus verwerking in één transactie.
//
// WAAROM DIT BESTAAT (audit 09 PLAT-BILL-002, audit 05 PLAT-DATA-003, audit 07)
//
// Acht producten ontvangen Stripe-webhooks en hebben vier verschillende
// mechanismen voor "verwerk dit maar één keer": claim-first (BEL, TEN, EAD,
// NEW), ordening op tijdstip (TIME) en opnieuw ophalen (FAM). Alle werken,
// maar de details hebben echte fouten opgeleverd:
//
// - NEW-114: zonder STRIPE_WEBHOOK_SECRET antwoordde de route 200 en
//   verwerkte niets. Stripe zag succes; er kwam nooit een betaling binnen.
//   Hier: geen geheim geeft 503, zodat Stripe blijft herhalen en er een alarm
//   afgaat in plaats van stilte. Ook de mountvolgorde (express.json vóór
//   express.raw) maakte de handtekening onleesbaar; dat wordt hier herkend.
// - EAD-252: de claim ("dit event is gezien") en de toekenning van betaalde
//   tokens zaten niet in dezelfde transactie. Een crash ertussen verloor de
//   tokens en Stripe's retry stopte op "al geclaimd". Hier lopen claim en
//   verwerking altijd in één transactie: faalt de verwerking, dan draait de
//   claim mee terug en werkt de retry.
// - VEY-508: de handtekening werd in tests nooit echt gecontroleerd. Zie
//   ./testing.
//
// WAT HET BEWUST NIET IS
//
// Geen tabel, geen databankdriver en geen Stripe-SDK: het product levert de
// transactie, de claim en de verwerking aan. Er is geen gedeelde
// gebeurtenissentabel en geen centrale webhookdienst; elk product ontvangt
// zijn eigen webhooks met zijn eigen geheim.
import type { Request, Response } from "express";
import { verifieerHandtekening } from "./handtekening.js";

export interface Gebeurtenis {
  id: string;
  type: string;
}

export interface WebhookOpties<E extends Gebeurtenis, Tx> {
  /** Het webhook-geheim. Ontbreekt het of is het leeg, dan antwoordt de handler 503. */
  geheim: string | undefined;
  /** Voert `werk` uit in één databanktransactie; een gegooide fout draait alles terug. */
  transactie: <R>(werk: (tx: Tx) => Promise<R>) => Promise<R>;
  /** Legt vast dat deze gebeurtenis is gezien. Geeft false als dat al eerder gebeurde. Draait in de transactie. */
  claim: (tx: Tx, gebeurtenis: E) => Promise<boolean>;
  /** De eigenlijke verwerking (tokens toekennen, status zetten). Draait in dezelfde transactie als de claim. */
  verwerk: (tx: Tx, gebeurtenis: E) => Promise<void>;
  /** Andere manier om de body te lezen dan JSON.parse. */
  parse?: (ruweBody: Buffer) => E;
  tolerantieSeconden?: number;
  /** Injecteerbare klok in milliseconden, voor tests. */
  nu?: () => number;
  /** Voor diagnostiek; wordt nooit met de body of het geheim aangeroepen. */
  log?: (niveau: "warn" | "error", bericht: string, meta?: Record<string, unknown>) => void;
}

export interface WebhookUitkomst {
  status: 200 | 400 | 500 | 503;
  body: Record<string, unknown>;
}

const geenLog: NonNullable<WebhookOpties<Gebeurtenis, unknown>["log"]> = () => undefined;

export async function verwerkWebhook<E extends Gebeurtenis, Tx>(
  opties: WebhookOpties<E, Tx>,
  ruweBody: unknown,
  handtekeningHeader: string | undefined
): Promise<WebhookUitkomst> {
  const log = opties.log ?? geenLog;

  if (opties.geheim === undefined || opties.geheim.trim() === "") {
    log("error", "webhook: geen geheim ingesteld; er wordt niets verwerkt");
    return { status: 503, body: { error: "webhook niet geconfigureerd" } };
  }

  if (!Buffer.isBuffer(ruweBody) && typeof ruweBody !== "string") {
    log("error", "webhook: de body is al geparsed; mount express.raw vóór express.json voor dit pad");
    return { status: 500, body: { error: "de ruwe body ontbreekt: mount express.raw voor dit pad, vóór express.json" } };
  }
  const ruw = typeof ruweBody === "string" ? Buffer.from(ruweBody) : ruweBody;

  const check = verifieerHandtekening(ruw, handtekeningHeader, opties.geheim, {
    tolerantieSeconden: opties.tolerantieSeconden,
    nu: opties.nu,
  });
  if (!check.ok) {
    log("warn", "webhook: handtekening geweigerd", { reden: check.reden });
    return { status: 400, body: { error: "ongeldig verzoek" } };
  }

  let gebeurtenis: E;
  try {
    gebeurtenis = opties.parse ? opties.parse(ruw) : (JSON.parse(ruw.toString("utf8")) as E);
  } catch {
    return { status: 400, body: { error: "ongeldig verzoek" } };
  }
  if (!gebeurtenis || typeof gebeurtenis.id !== "string" || gebeurtenis.id === "") {
    return { status: 400, body: { error: "ongeldig verzoek" } };
  }

  try {
    const verwerkt = await opties.transactie(async (tx) => {
      const nieuw = await opties.claim(tx, gebeurtenis);
      if (!nieuw) return false;
      await opties.verwerk(tx, gebeurtenis);
      return true;
    });
    return { status: 200, body: { ontvangen: true, verwerkt } };
  } catch (err) {
    // De transactie is teruggedraaid, dus ook de claim: de herhaling van Stripe kan slagen.
    log("error", "webhook: verwerking mislukt", { gebeurtenisId: gebeurtenis.id, type: gebeurtenis.type, fout: err instanceof Error ? err.name : "onbekend" });
    return { status: 500, body: { error: "verwerking mislukt" } };
  }
}

/** Express-adapter. Vereist `express.raw({ type: "application/json" })` op dit pad, vóór `express.json()`. */
export function expressWebhookHandler<E extends Gebeurtenis, Tx>(opties: WebhookOpties<E, Tx>, headerNaam = "stripe-signature") {
  return async function webhookHandler(req: Request, res: Response): Promise<void> {
    const header = req.headers[headerNaam];
    const uit = await verwerkWebhook(opties, req.body, Array.isArray(header) ? header[0] : header);
    res.status(uit.status).json(uit.body);
  };
}
