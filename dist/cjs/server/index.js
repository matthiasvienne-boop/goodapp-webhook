"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDAARD_TOLERANTIE_SECONDEN = exports.verifieerHandtekening = exports.expressWebhookHandler = exports.verwerkWebhook = void 0;
var webhook_js_1 = require("./webhook.js");
Object.defineProperty(exports, "verwerkWebhook", { enumerable: true, get: function () { return webhook_js_1.verwerkWebhook; } });
Object.defineProperty(exports, "expressWebhookHandler", { enumerable: true, get: function () { return webhook_js_1.expressWebhookHandler; } });
var handtekening_js_1 = require("./handtekening.js");
Object.defineProperty(exports, "verifieerHandtekening", { enumerable: true, get: function () { return handtekening_js_1.verifieerHandtekening; } });
Object.defineProperty(exports, "STANDAARD_TOLERANTIE_SECONDEN", { enumerable: true, get: function () { return handtekening_js_1.STANDAARD_TOLERANTIE_SECONDEN; } });
