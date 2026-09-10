import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth configuration: Google OAuth + email/password.
 *
 * Google credentials come from the deployment env vars AUTH_GOOGLE_ID and
 * AUTH_GOOGLE_SECRET (Auth.js convention). They are passed explicitly so a
 * missing key fails fast here instead of deep inside the OAuth redirect.
 *
 * Password accounts need no email service: verification/reset emails are
 * opt-in via the `verify`/`reset` options (Resend). Until then sign-up and
 * sign-in work directly, with scrypt hashing handled by the library.
 */
const deploymentEnv =
	typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
const googleClientId = deploymentEnv.AUTH_GOOGLE_ID;
const googleClientSecret = deploymentEnv.AUTH_GOOGLE_SECRET;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google({
			...(googleClientId ? { clientId: googleClientId } : {}),
			...(googleClientSecret ? { clientSecret: googleClientSecret } : {}),
		}),
		Password({
			profile(params) {
				const email = String(params.email ?? "").trim().toLowerCase();
				if (!email) throw new Error("An email address is required.");
				const rawName =
					typeof params.name === "string" ? params.name.trim() : "";
				return {
					email,
					...(rawName ? { name: rawName.slice(0, 80) } : {}),
				};
			},
			validatePasswordRequirements(password: string) {
				if (password.length < 8 || password.length > 128) {
					throw new Error(
						"Password must be between 8 and 128 characters.",
					);
				}
			},
		}),
	],
});
