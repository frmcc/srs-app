import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { authOptions } from "@/lib/auth";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Anmelden – SRS Master",
  description: "Melde dich an, um deine KI-generierten Quizze und Wiederholungen zu verwalten.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string; next?: string }>;
}) {
  // Already signed in — straight to the dashboard.
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/");

  const { error, callbackUrl, next } = await searchParams;

  // Only allow same-site relative targets (open-redirect guard). Must start with
  // a single "/" and contain no backslashes — "/\evil.com" and "//evil.com" are
  // both browser-normalised to another origin, so reject them.
  const rawTarget = callbackUrl || next;
  const safeCallbackUrl =
    rawTarget &&
    rawTarget.startsWith("/") &&
    !rawTarget.startsWith("//") &&
    !rawTarget.includes("\\")
      ? rawTarget
      : "/";

  return <LoginClient error={error} callbackUrl={safeCallbackUrl} />;
}
