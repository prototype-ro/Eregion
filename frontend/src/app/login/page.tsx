import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Nav } from "@/components/Nav";

export default function LoginPage() {
  return (
    <div className="shell">
      <Nav />
      <main className="flex flex-col gap-10 py-16">
        <h1 className="font-display text-[clamp(64px,9vw,128px)] leading-[0.92]">Sign in</h1>
        <Suspense fallback={null}>
          <AuthForm mode="login" />
        </Suspense>
      </main>
    </div>
  );
}
