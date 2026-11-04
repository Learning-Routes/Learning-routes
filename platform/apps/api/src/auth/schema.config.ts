import { betterAuth } from "better-auth";
import { oauthPlugins } from "./oauth-options";
import { authOptions } from "./options";

// Read only by Better Auth's CLI (`pnpm db:auth-schema`), never by the Worker.
export const auth = betterAuth({
  ...authOptions,
  baseURL: "http://localhost",
  plugins: oauthPlugins({
    resource: "http://localhost/mcp",
    fetchClientMetadataResource: () => {
      throw new Error("the schema needs no client");
    },
  }),
});
