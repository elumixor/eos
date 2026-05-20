import { createJWT } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Creates an anonymous user so cold visitors can use the app immediately.
// On sign-in, /auth/google or /auth/apple merges their data into the
// authenticated account.
export default handler(async () => {
  const user = await prisma.user.create({ data: { email: null, name: null } });
  return { token: createJWT(user) };
});
