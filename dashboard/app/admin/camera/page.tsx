import DetectionSettingsClient from "@/components/admin/DetectionSettingsClient";

export default function CameraPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#c8d0e0" }}>Camera Settings</h1>
        <p style={{ fontSize: "0.85rem", color: "#4a5568" }}>Manage camera index and feed</p>
      </div>
      <DetectionSettingsClient />
    </div>
  );
}
