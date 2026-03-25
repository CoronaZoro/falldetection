import { auth } from "@/auth";
import ResponderDashboardClient from "@/components/responder/ResponderDashboardClient";

export default async function ResponderDashboardPage() {
  const session = await auth();
  return (
    <ResponderDashboardClient
      userId={session!.user.id}
      userName={session!.user.name ?? "Responder"}
      isAuthorized={session!.user.isAuthorized ?? false}
    />
  );
}
