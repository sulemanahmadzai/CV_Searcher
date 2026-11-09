import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · CV Search" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-semibold text-white">
            CV
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">CV Search</h1>
            <p className="text-sm text-muted">Sign in to search your CV library.</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
