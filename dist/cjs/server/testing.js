"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maakTestHandtekening = maakTestHandtekening;
// Hulp voor tests in een product: een echte, geldige handtekening-header.
// Gebruik dit in plaats van `constructEvent` te mocken (VEY-508).
const crypto_1 = require("crypto");
function maakTestHandtekening(ruweBody, geheim, tijdstipSeconden = Math.floor(Date.now() / 1000)) {
    const hmac = (0, crypto_1.createHmac)("sha256", geheim)
        .update(`${tijdstipSeconden}.`)
        .update(typeof ruweBody === "string" ? Buffer.from(ruweBody) : ruweBody)
        .digest("hex");
    return `t=${tijdstipSeconden},v1=${hmac}`;
}
