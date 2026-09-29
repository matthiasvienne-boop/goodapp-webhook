"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDAARD_TOLERANTIE_SECONDEN = void 0;
exports.verifieerHandtekening = verifieerHandtekening;
// Stripe-compatibele handtekeningcontrole, zonder de Stripe-SDK.
//
// WAAROM EEN EIGEN CONTROLE
//
// Het format is publiek en klein: een header `t=<unix>,v1=<hex-hmac>[,v1=...]`
// waarbij de HMAC-SHA256 over `<t>.<ruwe body>` met het geheim als sleutel
// wordt gemaakt. Zelf controleren maakt de bibliotheek onafhankelijk van een
// SDK-versie én toetsbaar zonder netwerk en zonder gemockte `constructEvent`:
// VEY-508 vond dat de handtekeningverificatie in de Veynoris-tests nooit werd
// uitgeoefend omdat `constructEvent` gemockt was. `maakTestHandtekening`
// (zie ./testing) maakt hier een echte header voor.
//
// De controle is constant-time (`timingSafeEqual`), accepteert meerdere `v1`
// (Stripe stuurt er meer dan een tijdens het roteren van een geheim), en
// weigert een tijdstip dat te oud of te ver in de toekomst ligt (replay).
const crypto_1 = require("crypto");
exports.STANDAARD_TOLERANTIE_SECONDEN = 300;
function verifieerHandtekening(ruweBody, header, geheim, opties = {}) {
    if (header === undefined || header.trim() === "")
        return { ok: false, reden: "ontbreekt" };
    let tijdstip;
    const handtekeningen = [];
    for (const deel of header.split(",")) {
        const i = deel.indexOf("=");
        if (i < 0)
            continue;
        const sleutel = deel.slice(0, i).trim();
        const waarde = deel.slice(i + 1).trim();
        if (sleutel === "t" && /^\d+$/.test(waarde))
            tijdstip = Number(waarde);
        else if (sleutel === "v1" && waarde !== "")
            handtekeningen.push(waarde);
    }
    if (tijdstip === undefined || handtekeningen.length === 0)
        return { ok: false, reden: "onleesbaar" };
    const tolerantie = opties.tolerantieSeconden ?? exports.STANDAARD_TOLERANTIE_SECONDEN;
    const nuSeconden = Math.floor((opties.nu ?? Date.now)() / 1000);
    if (Math.abs(nuSeconden - tijdstip) > tolerantie)
        return { ok: false, reden: "te_oud" };
    const verwacht = (0, crypto_1.createHmac)("sha256", geheim)
        .update(`${tijdstip}.`)
        .update(typeof ruweBody === "string" ? Buffer.from(ruweBody) : ruweBody)
        .digest();
    for (const hex of handtekeningen) {
        if (!/^[0-9a-f]+$/i.test(hex) || hex.length !== verwacht.length * 2)
            continue;
        if ((0, crypto_1.timingSafeEqual)(Buffer.from(hex, "hex"), verwacht))
            return { ok: true, tijdstip };
    }
    return { ok: false, reden: "onjuist" };
}
