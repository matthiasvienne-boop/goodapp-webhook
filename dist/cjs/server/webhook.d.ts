import type { Request, Response } from "express";
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
export declare function verwerkWebhook<E extends Gebeurtenis, Tx>(opties: WebhookOpties<E, Tx>, ruweBody: unknown, handtekeningHeader: string | undefined): Promise<WebhookUitkomst>;
/** Express-adapter. Vereist `express.raw({ type: "application/json" })` op dit pad, vóór `express.json()`. */
export declare function expressWebhookHandler<E extends Gebeurtenis, Tx>(opties: WebhookOpties<E, Tx>, headerNaam?: string): (req: Request, res: Response) => Promise<void>;
