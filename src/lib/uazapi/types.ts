export interface WebhookConfig {
  url: string;
  events: string[];
  enabled?: boolean;
  addUrlEvents?: boolean;
  addUrlTypesMessages?: boolean;
  excludeMessages?: string[];
}

export interface Button {
  id: string;
  text: string;
}

export interface Section {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export type MediaType =
  | "image"
  | "video"
  | "document"
  | "audio"
  | "ptt"
  | "sticker";

export interface SendOptions {
  replyId?: string;
  delay?: number;
  linkPreview?: boolean;
}

export interface MediaOptions extends SendOptions {
  caption?: string;
  docName?: string;
  viewOnce?: boolean;
}

export interface LocationOptions {
  name?: string;
  address?: string;
}

export interface InstanceInfo {
  id: string;
  token: string;
  status: "disconnected" | "connecting" | "connected";
  qrcode?: string;
  paircode?: string;
  name: string;
  profileName?: string;
  profilePicUrl?: string;
  isBusiness?: boolean;
}
