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
  type: "heartbeat" | "fall_alert" | "sos_alert" | "recovery" | "voice_alert";
  timestamp: number;
  event_id?: string;
  person_id?: number;
  state?: string;
  ar?: number;
  down_duration?: number;
  message?: string;
  status?: string;
  persons_detected?: number;
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
  type: "fall" | "sos" | "recovery" | "heartbeat" | "voice" | "ack";
  message: string;
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
