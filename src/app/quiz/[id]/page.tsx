import { redirect } from "next/navigation";

/**
 * Per-module deep link. A calendar event (or any shared link) can point at
 * /quiz/<id>; this hands off to the dashboard's existing ?quizId= handler, which
 * opens that module's CURRENT quiz directly instead of the plain home screen.
 */
export default async function QuizDeepLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/?quizId=${encodeURIComponent(id)}`);
}
