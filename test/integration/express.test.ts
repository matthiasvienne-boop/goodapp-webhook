// Met een echte Express-app: de mountvolgorde die NEW-114 kapot maakte.
import { describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { expressWebhookHandler } from "../../src/server/webhook";
import { maakTestHandtekening } from "../../src/server/testing";

const GEHEIM = "whsec_int";

async function start(rawVoorJson: boolean) {
  const verwerkt: string[] = [];
  const app = express();
  const handler = expressWebhookHandler<{ id: string; type: string }, null>({
    geheim: GEHEIM,
    transactie: (werk) => werk(null),
    claim: async () => true,
    verwerk: async (_tx, e) => { verwerkt.push(e.id); },
  });
  if (rawVoorJson) {
    app.use("/webhook", express.raw({ type: "application/json" }));
    app.use(express.json());
  } else {
    app.use(express.json());
    app.use("/webhook", express.raw({ type: "application/json" }));
  }
  app.post("/webhook", handler);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/webhook`, verwerkt, sluit: () => new Promise<void>((r) => server.close(() => r())) };
}

async function post(url: string) {
  const body = JSON.stringify({ id: "evt_int", type: "invoice.paid" });
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": maakTestHandtekening(body, GEHEIM) }, body });
}

describe("expressWebhookHandler", () => {
  it("met express.raw vóór express.json: 200 en verwerkt", async () => {
    const s = await start(true);
    try {
      const res = await post(s.url);
      expect(res.status).toBe(200);
      expect(s.verwerkt).toEqual(["evt_int"]);
    } finally {
      await s.sluit();
    }
  });

  it("met express.json vóór express.raw (de fout uit NEW-114): 500 met een duidelijke reden en niets verwerkt", async () => {
    const s = await start(false);
    try {
      const res = await post(s.url);
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).toMatch(/raw/i);
      expect(s.verwerkt).toEqual([]);
    } finally {
      await s.sluit();
    }
  });
});
