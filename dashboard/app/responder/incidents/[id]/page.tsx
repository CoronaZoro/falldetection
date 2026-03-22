import IncidentDetailClient from "@/components/IncidentDetailClient";

export default function ResponderIncidentDetailPage({ params }: { params: { id: string } }) {
  return <IncidentDetailClient id={params.id} role="RESPONDER" />;
}
