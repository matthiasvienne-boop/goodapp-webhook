import { describe, expect, it } from "vitest";
import { verifieerHandtekening } from "../../src/server/handtekening";
import { maakTestHandtekening } from "../../src/server/testing";

const GEHEIM = "whsec_testgeheim";
const BODY = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
const NU = 1_800_000_000;

describe("verifieerHandtekening", () => {
  it("accepteert een correcte handtekening", () => {
    const header = maakTestHandtekening(BODY, GEHEIM, NU);
    expect(verifieerHandtekening(BODY, header, GEHEIM, { nu: () => NU * 1000 })).toEqual({ ok: true, tijdstip: NU });
  });

  it("accepteert ook een Buffer als body", () => {
    const header = maakTestHandtekening(BODY, GEHEIM, NU);
    expect(verifieerHandtekening(Buffer.from(BODY), header, GEHEIM, { nu: () => NU * 1000 }).ok).toBe(true);
  });

  it("weigert een handtekening met een ander geheim", () => {
    const header = maakTestHandtekening(BODY, "whsec_ander", NU);
    expect(verifieerHandtekening(BODY, header, GEHEIM, { nu: () => NU * 1000 })).toEqual({ ok: false, reden: "onjuist" });
  });

  it("weigert een gewijzigde body", () => {
    const header = maakTestHandtekening(BODY, GEHEIM, NU);
    expect(verifieerHandtekening(BODY + " ", header, GEHEIM, { nu: () => NU * 1000 })).toEqual({ ok: false, reden: "onjuist" });
  });

  it("weigert een te oud tijdstip (replay) en past de tolerantie aan", () => {
    const header = maakTestHandtekening(BODY, GEHEIM, NU);
    const later = (NU + 301) * 1000;
    expect(verifieerHandtekening(BODY, header, GEHEIM, { nu: () => later })).toEqual({ ok: false, reden: "te_oud" });
    expect(verifieerHandtekening(BODY, header, GEHEIM, { nu: () => later, tolerantieSeconden: 600 }).ok).toBe(true);
  });

  it("weigert een tijdstip ver in de toekomst", () => {
    const header = maakTestHandtekening(BODY, GEHEIM, NU + 3600);
    expect(verifieerHandtekening(BODY, header, GEHEIM, { nu: () => NU * 1000 })).toEqual({ ok: false, reden: "te_oud" });
  });

  it("meldt een ontbrekende of onleesbare header", () => {
    expect(verifieerHandtekening(BODY, undefined, GEHEIM)).toEqual({ ok: false, reden: "ontbreekt" });
    expect(verifieerHandtekening(BODY, "onzin", GEHEIM)).toEqual({ ok: false, reden: "onleesbaar" });
    expect(verifieerHandtekening(BODY, "t=abc,v1=00", GEHEIM)).toEqual({ ok: false, reden: "onleesbaar" });
  });

  it("accepteert de handtekening als een van meerdere v1-waarden klopt (geheim in rotatie)", () => {
    const goed = maakTestHandtekening(BODY, GEHEIM, NU);
    const v1 = /v1=([0-9a-f]+)/.exec(goed)![1];
    const header = `t=${NU},v1=${"0".repeat(64)},v1=${v1}`;
    expect(verifieerHandtekening(BODY, header, GEHEIM, { nu: () => NU * 1000 }).ok).toBe(true);
  });

  it("weigert een v1-waarde van een verkeerde lengte zonder te gooien", () => {
    expect(verifieerHandtekening(BODY, `t=${NU},v1=abcd`, GEHEIM, { nu: () => NU * 1000 })).toEqual({ ok: false, reden: "onjuist" });
  });
});
