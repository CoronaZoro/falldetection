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
    <div className='min-h-screen bg-[#0a0c10] flex flex-col'>
      <ResponderNav
        user={{
          name: session.user.name ?? "Responder",
          email: session.user.email ?? "",
        }}
      />
      <main className='flex-1 px-4 py-6'>{children}</main>
    </div>
  );
}
