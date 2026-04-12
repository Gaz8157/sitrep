import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";

const allowedIds = (process.env.ALLOWED_DISCORD_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/auth",
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },

  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    }),
    Credentials({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const pw = credentials?.password as string;
        const adminPw = process.env.ADMIN_PASSWORD || "zeus";
        if (pw && pw.toLowerCase() === adminPw.toLowerCase()) {
          return { id: "admin", name: "Admin", email: "admin@local" };
        }
        return null;
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      // Password login — always allowed
      if (account?.provider === "credentials") return true;

      // Discord login — check whitelist
      if (account?.provider === "discord") {
        // Discord profile.id is the real Discord user ID
        const discordId = (profile as Record<string, unknown>)?.id as string || user.id || "";
        console.log(`[AUTH] Discord login attempt: user.id=${user.id} profile.id=${discordId} name=${user.name} allowed=${allowedIds}`);
        if (allowedIds.length === 0) return true; // No whitelist = allow all
        return allowedIds.includes(discordId) || allowedIds.includes(user.id || "");
      }

      return false;
    },

    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.picture = user.image;
      }
      if (account?.provider === "discord" && profile) {
        token.discordId = profile.id;
        token.name = (profile as Record<string, unknown>).global_name as string || profile.name || user?.name;
        token.picture = user?.image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
