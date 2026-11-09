// Creates the login account from ADMIN_EMAIL / ADMIN_PASSWORD in .env.local.
// After it runs, the account still has no access until it is added to
// public.app_users (done once in SQL; see README).
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data, error } = await supabase.auth.signUp({ email: email!, password: password! });
  if (error) {
    console.error("Sign-up failed:", error.message);
    process.exit(1);
  }
  console.log("User id:", data.user?.id);
  console.log("Session returned:", Boolean(data.session), "(false means email confirmation is on)");
}

main();
