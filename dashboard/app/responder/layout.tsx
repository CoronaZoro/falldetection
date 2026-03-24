import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ResponderNav from "@/components/responder/ResponderNav";

export default async function ResponderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "RESPONDER") redirect("/login");

  return (
    <div className='h-screen bg-page flex flex-col overflow-hidden'>
      <ResponderNav
        user={{
          name: session.user.name ?? "Responder",
          email: session.user.email ?? "",
        }}
      />
      <main className='flex-1 min-h-0 overflow-hidden px-3 py-2'>
        {children}
      </main>
    </div>
  );
}
