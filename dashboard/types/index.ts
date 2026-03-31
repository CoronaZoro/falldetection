export type Role = "ADMIN" | "RESPONDER";
export type IncidentType = "FALL";
export type IncidentStatus =
  | "UNACKNOWLEDGED"
  | "ACKNOWLEDGED"
  | "RESPONDING"
  | "ON_SCENE"
  | "RESOLVED"
  | "RECOVERED"
  | "FALSE_ALARM";

export interface WSMessage {
  type: "heartbeat" | "state_update" | "fall_alert" | "recovery" | "escalation" | "line_notified" | "voice_alert" | "voice_tts_ready" | "call_status" | "mic_status";
  timestamp: number;
  event_id?: string;
  person_id?: number;
  state?: string;
  ar?: number;
  down_duration?: number;
  velocity?: number;                  // hip velocity at fall moment (norm/s) — fall_alert only
  message?: string;
  speaker?: "user" | "assistant";
  mid?: number;                       // voice_alert dedup ID
  speed?: string;                     // voice_alert TTS speed label — typewriter sync
  callStatus?: "active" | "idle";
  auto_resolved?: boolean;
  status?: string;
  persons_detected?: number;
}

export interface VoiceEntry {
  speaker: "user" | "assistant";
  text: string;
  timestamp: number;
  speed?: string;  // TTS speed label at time of broadcast — used for typewriter sync
}

export interface AckMessage {
  type: "acknowledge";
  event_id: string;
}

export interface Incident {
  id: string;
  eventId: string;
  type: IncidentType;
  personId: number;
  ar: number;
  downDuration: number;
  velocity: number;
  status: IncidentStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  notes: string | null;
  reportText: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isAuthorized: boolean;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface SystemConfig {
  id: string;
  location: string;
  cameraIndex: number;
  arThreshold: number;
  transitionTime: number;
  confirmSeconds: number;
  escalationSeconds: number;
  fallVelThreshold: number;
  sleepVelThreshold: number;
  poseSpineFallen: number;
  recoveryLabelTime: number;
  movementThreshold: number;
}

export interface EventLogEntry {
  id: string;
  type: "fall" | "recovery" | "ack";
  message: string;
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
