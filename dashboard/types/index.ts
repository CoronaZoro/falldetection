export type Role = "ADMIN" | "RESPONDER";
export type IncidentType = "FALL" | "SOS";
export type IncidentStatus =
  | "UNACKNOWLEDGED"
  | "ACKNOWLEDGED"
  | "RESPONDING"
  | "ON_SCENE"
  | "RESOLVED"
  | "FALSE_ALARM";

export interface WSMessage {
  type: "heartbeat" | "fall_alert" | "sos_alert" | "recovery" | "voice_alert" | "call_status";
  timestamp: number;
  event_id?: string;
  person_id?: number;
  state?: string;
  ar?: number;
  down_duration?: number;
  message?: string;
  speaker?: "user" | "assistant";
  mid?: number;                       // voice_alert dedup ID
  callStatus?: "active" | "idle";
  status?: string;
  persons_detected?: number;
}

export interface VoiceEntry {
  speaker: "user" | "assistant";
  text: string;
  timestamp: number;
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
  cameraIndex: number;
  arThreshold: number;
  transitionTime: number;
  confirmSeconds: number;
  twilioEnabled: boolean;
  twilioNumber: string | null;
  escalationSeconds: number;
}

export interface EventLogEntry {
  id: string;
  type: "fall" | "sos" | "recovery" | "ack";
  message: string;
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
