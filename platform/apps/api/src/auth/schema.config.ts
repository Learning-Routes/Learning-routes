import { betterAuth } from "better-auth";
import { authOptions } from "./options";

// Read only by Better Auth's CLI (`pnpm db:auth-schema`), never by the Worker.
export const auth = betterAuth(authOptions);
