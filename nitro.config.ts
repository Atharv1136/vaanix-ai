import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "node-server",
  routeRules: {
    "/api/**": { proxy: "http://127.0.0.1:3001/api/**" },
    "/webhooks/**": { proxy: "http://127.0.0.1:3001/webhooks/**" },
  },
});
