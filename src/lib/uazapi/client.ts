import type {
  Button,
  LocationOptions,
  MediaOptions,
  MediaType,
  Section,
  SendOptions,
  WebhookConfig,
} from "./types";

const UAZAPI_SERVER_URL = process.env.UAZAPI_SERVER_URL!;
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN!;

interface UazapiRequestOptions {
  method?: string;
  path: string;
  body?: Record<string, unknown>;
  token?: string; // instance token (for instance-specific calls)
}

export async function uazapiFetch<T = unknown>({
  method = "GET",
  path,
  body,
  token,
}: UazapiRequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["token"] = token;
  } else {
    headers["admintoken"] = UAZAPI_ADMIN_TOKEN;
  }

  const response = await fetch(`${UAZAPI_SERVER_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `uazapi error: ${response.status} ${response.statusText} – ${text}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const uazapi = {
  // ===== INSTANCE MANAGEMENT =====

  /** Create a new WhatsApp instance (admin). */
  createInstance: (name: string) =>
    uazapiFetch({ method: "POST", path: "/instance/create", body: { name } }),

  /** Start the connection flow – returns QR code or pair code. */
  connectInstance: (token: string, phone?: string) =>
    uazapiFetch({
      method: "POST",
      path: "/instance/connect",
      token,
      body: phone ? { phone } : undefined,
    }),

  /** Disconnect a running instance. */
  disconnectInstance: (token: string) =>
    uazapiFetch({ method: "POST", path: "/instance/disconnect", token }),

  /** Reset (logout + clear session) an instance. */
  resetInstance: (token: string) =>
    uazapiFetch({ method: "POST", path: "/instance/reset", token }),

  /** Get current instance status (connected / disconnected / connecting). */
  getInstanceStatus: (token: string) =>
    uazapiFetch({ path: "/instance/status", token }),

  /** Delete an instance permanently (instance token required). */
  deleteInstance: (token: string) =>
    uazapiFetch({ method: "DELETE", path: "/instance", token }),

  /** List every instance on the server (admin). */
  getAllInstances: () => uazapiFetch({ path: "/instance/list" }),

  // ===== WEBHOOK =====

  /** Get current webhook configuration. */
  getWebhook: (token: string) => uazapiFetch({ path: "/webhook", token }),

  /** Create or update the webhook for an instance. */
  setWebhook: (token: string, config: WebhookConfig) =>
    uazapiFetch({
      method: "POST",
      path: "/webhook",
      token,
      body: config as unknown as Record<string, unknown>,
    }),

  /** Remove a webhook by its id. */
  deleteWebhook: (token: string, webhookId: string) =>
    uazapiFetch({
      method: "DELETE",
      path: `/webhook/${webhookId}`,
      token,
    }),

  // ===== SENDING MESSAGES =====

  /** Send a plain text message. */
  sendText: (phone: string, text: string, token: string, options?: SendOptions) =>
    uazapiFetch({
      method: "POST",
      path: "/send/text",
      token,
      body: {
        phone,
        message: text,
        ...(options?.replyId && { replyId: options.replyId }),
        ...(options?.delay && { delay: options.delay }),
        ...(options?.linkPreview !== undefined && {
          linkPreview: options.linkPreview,
        }),
      },
    }),

  /** Send media (image, video, document, audio, ptt, sticker). */
  sendMedia: (
    phone: string,
    type: MediaType,
    file: string,
    token: string,
    options?: MediaOptions
  ) =>
    uazapiFetch({
      method: "POST",
      path: `/send/${type}`,
      token,
      body: {
        phone,
        file,
        ...(options?.caption && { caption: options.caption }),
        ...(options?.docName && { docName: options.docName }),
        ...(options?.viewOnce && { viewOnce: options.viewOnce }),
        ...(options?.replyId && { replyId: options.replyId }),
        ...(options?.delay && { delay: options.delay }),
      },
    }),

  /** Send interactive buttons. */
  sendButtons: (
    phone: string,
    text: string,
    buttons: Button[],
    token: string,
    options?: SendOptions
  ) =>
    uazapiFetch({
      method: "POST",
      path: "/send/buttons",
      token,
      body: {
        phone,
        title: text,
        buttons,
        ...(options?.replyId && { replyId: options.replyId }),
        ...(options?.delay && { delay: options.delay }),
      },
    }),

  /** Send an interactive list (menu). */
  sendList: (
    phone: string,
    text: string,
    description: string,
    buttonText: string,
    sections: Section[],
    token: string
  ) =>
    uazapiFetch({
      method: "POST",
      path: "/send/menu",
      token,
      body: { phone, title: text, description, buttonText, sections },
    }),

  /** Send a vCard contact. */
  sendContact: (
    phone: string,
    contactName: string,
    contactNumber: string,
    token: string
  ) =>
    uazapiFetch({
      method: "POST",
      path: "/send/contact",
      token,
      body: { phone, name: contactName, number: contactNumber },
    }),

  /** Send a location pin. */
  sendLocation: (
    phone: string,
    lat: number,
    lng: number,
    token: string,
    options?: LocationOptions
  ) =>
    uazapiFetch({
      method: "POST",
      path: "/send/location",
      token,
      body: {
        phone,
        lat,
        lng,
        ...(options?.name && { name: options.name }),
        ...(options?.address && { address: options.address }),
      },
    }),

  /** Send a Pix payment button. */
  sendPixButton: (
    phone: string,
    pixKey: string,
    amount: number,
    token: string
  ) =>
    uazapiFetch({
      method: "POST",
      path: "/send/pix",
      token,
      body: { phone, pixKey, amount },
    }),

  /** Show "typing..." (composing) presence. */
  sendTyping: (phone: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/send/typing",
      token,
      body: { phone },
    }),

  // ===== MESSAGE MANAGEMENT =====

  /** Mark all messages in a chat as read. */
  markRead: (phone: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/chat/read",
      token,
      body: { phone },
    }),

  /** Delete (revoke) a sent message. */
  deleteMessage: (messageId: string, token: string) =>
    uazapiFetch({
      method: "DELETE",
      path: `/message/${messageId}`,
      token,
    }),

  /** React to a message with an emoji. */
  reactToMessage: (messageId: string, emoji: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/message/react",
      token,
      body: { messageId, emoji },
    }),

  /** Download media from a received message. */
  downloadMedia: (messageId: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/message/download-media",
      token,
      body: { messageId },
    }),

  /** Search / list messages in a chat. */
  findMessages: (
    phone: string,
    token: string,
    options?: { text?: string; limit?: number }
  ) =>
    uazapiFetch({
      method: "POST",
      path: "/message/find",
      token,
      body: {
        phone,
        ...(options?.text && { text: options.text }),
        ...(options?.limit && { limit: options.limit }),
      },
    }),

  // ===== CONTACTS =====

  /** List all contacts known to the instance. */
  getContacts: (token: string) =>
    uazapiFetch({ path: "/contact/list", token }),

  /** Check whether a phone number is registered on WhatsApp. */
  checkContact: (phone: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/contact/check",
      token,
      body: { phone },
    }),

  // ===== CHAT =====

  /** Block a contact. */
  blockContact: (phone: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/chat/block",
      token,
      body: { phone },
    }),

  /** Get the list of blocked contacts. */
  getBlockList: (token: string) =>
    uazapiFetch({ path: "/chat/blocklist", token }),

  /** Archive or unarchive a chat. */
  archiveChat: (phone: string, archive: boolean, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/chat/archive",
      token,
      body: { phone, archive },
    }),

  // ===== PROFILE =====

  /** Get the business profile info. */
  getBusinessProfile: (token: string) =>
    uazapiFetch({ path: "/profile/business", token }),

  /** Update the instance display name. */
  updateProfileName: (name: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/profile/name",
      token,
      body: { name },
    }),

  /** Update the instance profile picture (base64 or URL). */
  updateProfileImage: (image: string, token: string) =>
    uazapiFetch({
      method: "POST",
      path: "/profile/image",
      token,
      body: { image },
    }),
};
