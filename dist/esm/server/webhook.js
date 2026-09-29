import { verifieerHandtekening } from "./handtekening.js";
const geenLog = () => undefined;
export async function verwerkWebhook(opties, ruweBody, handtekeningHeader) {
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
    let gebeurtenis;
    try {
        gebeurtenis = opties.parse ? opties.parse(ruw) : JSON.parse(ruw.toString("utf8"));
    }
    catch {
        return { status: 400, body: { error: "ongeldig verzoek" } };
    }
    if (!gebeurtenis || typeof gebeurtenis.id !== "string" || gebeurtenis.id === "") {
        return { status: 400, body: { error: "ongeldig verzoek" } };
    }
    try {
        const verwerkt = await opties.transactie(async (tx) => {
            const nieuw = await opties.claim(tx, gebeurtenis);
            if (!nieuw)
                return false;
            await opties.verwerk(tx, gebeurtenis);
            return true;
        });
        return { status: 200, body: { ontvangen: true, verwerkt } };
    }
    catch (err) {
        // De transactie is teruggedraaid, dus ook de claim: de herhaling van Stripe kan slagen.
        log("error", "webhook: verwerking mislukt", { gebeurtenisId: gebeurtenis.id, type: gebeurtenis.type, fout: err instanceof Error ? err.name : "onbekend" });
        return { status: 500, body: { error: "verwerking mislukt" } };
    }
}
/** Express-adapter. Vereist `express.raw({ type: "application/json" })` op dit pad, vóór `express.json()`. */
export function expressWebhookHandler(opties, headerNaam = "stripe-signature") {
    return async function webhookHandler(req, res) {
        const header = req.headers[headerNaam];
        const uit = await verwerkWebhook(opties, req.body, Array.isArray(header) ? header[0] : header);
        res.status(uit.status).json(uit.body);
    };
}
