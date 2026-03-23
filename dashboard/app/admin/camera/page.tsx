import DetectionSettingsClient from "@/components/admin/DetectionSettingsClient";

export default function CameraPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-[#c9d1e0]">Camera Settings</h1>
        <p className="section-label mt-0.5">Manage camera index and feed</p>
      </div>
      <DetectionSettingsClient />
    </div>
  );
}
