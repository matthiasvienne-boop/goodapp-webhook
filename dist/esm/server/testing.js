// Hulp voor tests in een product: een echte, geldige handtekening-header.
// Gebruik dit in plaats van `constructEvent` te mocken (VEY-508).
import { createHmac } from "crypto";
export function maakTestHandtekening(ruweBody, geheim, tijdstipSeconden = Math.floor(Date.now() / 1000)) {
    const hmac = createHmac("sha256", geheim)
        .update(`${tijdstipSeconden}.`)
        .update(typeof ruweBody === "string" ? Buffer.from(ruweBody) : ruweBody)
        .digest("hex");
    return `t=${tijdstipSeconden},v1=${hmac}`;
}
