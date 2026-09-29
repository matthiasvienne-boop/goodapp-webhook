export declare const STANDAARD_TOLERANTIE_SECONDEN = 300;
export type HandtekeningResultaat = {
    ok: true;
    tijdstip: number;
} | {
    ok: false;
    reden: "ontbreekt" | "onleesbaar" | "te_oud" | "onjuist";
};
export interface HandtekeningOpties {
    /** Maximaal toegestane afwijking van het tijdstip in seconden. Standaard 300 (zoals Stripe). */
    tolerantieSeconden?: number;
    /** Injecteerbare klok in milliseconden, voor tests. */
    nu?: () => number;
}
export declare function verifieerHandtekening(ruweBody: Buffer | string, header: string | undefined, geheim: string, opties?: HandtekeningOpties): HandtekeningResultaat;
