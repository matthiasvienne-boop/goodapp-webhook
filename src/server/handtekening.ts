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
import { createHmac, timingSafeEqual } from "crypto";

export const STANDAARD_TOLERANTIE_SECONDEN = 300;

export type HandtekeningResultaat =
  | { ok: true; tijdstip: number }
  | { ok: false; reden: "ontbreekt" | "onleesbaar" | "te_oud" | "onjuist" };

export interface HandtekeningOpties {
  /** Maximaal toegestane afwijking van het tijdstip in seconden. Standaard 300 (zoals Stripe). */
  tolerantieSeconden?: number;
  /** Injecteerbare klok in milliseconden, voor tests. */
  nu?: () => number;
}

export function verifieerHandtekening(
  ruweBody: Buffer | string,
  header: string | undefined,
  geheim: string,
  opties: HandtekeningOpties = {}
): HandtekeningResultaat {
  if (header === undefined || header.trim() === "") return { ok: false, reden: "ontbreekt" };

  let tijdstip: number | undefined;
  const handtekeningen: string[] = [];
  for (const deel of header.split(",")) {
    const i = deel.indexOf("=");
    if (i < 0) continue;
    const sleutel = deel.slice(0, i).trim();
    const waarde = deel.slice(i + 1).trim();
    if (sleutel === "t" && /^\d+$/.test(waarde)) tijdstip = Number(waarde);
    else if (sleutel === "v1" && waarde !== "") handtekeningen.push(waarde);
  }
  if (tijdstip === undefined || handtekeningen.length === 0) return { ok: false, reden: "onleesbaar" };

  const tolerantie = opties.tolerantieSeconden ?? STANDAARD_TOLERANTIE_SECONDEN;
  const nuSeconden = Math.floor((opties.nu ?? Date.now)() / 1000);
  if (Math.abs(nuSeconden - tijdstip) > tolerantie) return { ok: false, reden: "te_oud" };

  const verwacht = createHmac("sha256", geheim)
    .update(`${tijdstip}.`)
    .update(typeof ruweBody === "string" ? Buffer.from(ruweBody) : ruweBody)
    .digest();

  for (const hex of handtekeningen) {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length !== verwacht.length * 2) continue;
    if (timingSafeEqual(Buffer.from(hex, "hex"), verwacht)) return { ok: true, tijdstip };
  }
  return { ok: false, reden: "onjuist" };
}
