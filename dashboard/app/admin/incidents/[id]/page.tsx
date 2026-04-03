import IncidentDetailClient from "@/components/IncidentDetailClient";

export default function AdminIncidentDetailPage({ params }: { params: { id: string } }) {
  return <IncidentDetailClient id={params.id} role="ADMIN" />;
}
