import makeWASocket, {
  Browsers,
  DisconnectReason,
  UserFacingSocketConfig,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  extractImageThumb,
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WAMessage,
  WAMessageKey,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import {
  setChatThemeColor,
  setChatBubbleColor,
  clearChatTheme,
  setChatWallpaper,
  patchChatThemeProto,
  patchWallpaperMappings,
  patchBaileysSendFile,
  BUBBLE_SCHEMES,
} from "./themes.js";
import { A2UI, sendA2UIWidget } from "./a2ui.js";

export * from "@whiskeysockets/baileys";
export * from "./themes.js";
export * from "./a2ui.js";

export interface CustomBotOptions {
  sessionDir?: string;
  phoneNumber?: string;
  customPairingCode?: string;
  autoReconnect?: boolean;
  onPairingCode?: (formattedCode: string, rawCode: string) => void;
  onReady?: (sock: WASocket) => void;
  socketConfig?: Partial<UserFacingSocketConfig>;
}

export interface NativeButton {
  type: "reply" | "url" | "copy" | "call" | "list";
  displayText: string;
  id?: string;
  url?: string;
  copyCode?: string;
  phoneNumber?: string;
  sections?: any[];
}

export interface LinkCardOptions {
  text: string;
  title: string;
  body?: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  thumbnailBuffer?: Buffer;
  largeThumbnail?: boolean;
}

export async function createVictoryBaileys(options: CustomBotOptions = {}): Promise<any> {
  patchChatThemeProto();
  patchWallpaperMappings();

  const {
    sessionDir = "./auth_session",
    phoneNumber,
    customPairingCode = "VICT-ORYY",
    autoReconnect = true,
    onPairingCode,
    onReady,
    socketConfig = {},
  } = options;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  let pairingRequested = false;

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: true,
    markOnlineOnConnect: true,
    ...socketConfig,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if ((qr || connection === "connecting") && !state.creds.registered && phoneNumber && !pairingRequested) {
      pairingRequested = true;
      try {
        const cleanNumber = phoneNumber.replace(/\D/g, "");
        const cleanCode = customPairingCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        await new Promise((res) => setTimeout(res, 1500));
        const code = await sock.requestPairingCode(cleanNumber, cleanCode);
        const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
        if (onPairingCode) onPairingCode(formatted, code);
        else console.log(`\n[VICTORY-BAILEYS] Pairing Code: ${formatted}\n`);
      } catch (err) {
        pairingRequested = false;
        console.error("[VICTORY-BAILEYS] Pairing code error:", err);
      }
    }
    if (connection === "open") {
      console.log("[VICTORY-BAILEYS] Connected to WhatsApp!");
      if (onReady) onReady(sock);
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (autoReconnect && statusCode !== DisconnectReason.loggedOut) {
        createVictoryBaileys(options);
      }
    }
  });

  const helpers = {
    sendText: (jid: string, text: string, mentions?: string[], quoted?: WAMessage) =>
      sock.sendMessage(jid, { text, mentions }, { quoted }),

    sendLinkCard: (jid: string, card: LinkCardOptions, quoted?: WAMessage) =>
      sock.sendMessage(jid, {
        text: card.text,
        contextInfo: {
          externalAdReply: {
            title: card.title,
            body: card.body || "",
            mediaType: 1,
            renderLargerThumbnail: card.largeThumbnail !== false,
            sourceUrl: card.sourceUrl,
            thumbnailUrl: card.thumbnailUrl,
            thumbnail: card.thumbnailBuffer,
          },
        },
      }, { quoted }),

    sendA2UI: (jid: string, ui: A2UI, footer?: string, contextInfo?: Record<string, any>) =>
      sendA2UIWidget(sock, jid, { a2ui: ui, footer, contextInfo }),

    setTheme: (jid: string, colorOrHex: string, doodle = false) =>
      setChatThemeColor(sock, jid, colorOrHex, doodle),

    setBubbleColor: (jid: string, schemeName: string) =>
      setChatBubbleColor(sock, jid, schemeName),

    setWallpaper: (jid: string, imageSource: Buffer | { url: string }, dimLevel = 0) =>
      setChatWallpaper(sock, jid, imageSource, dimLevel),

    clearTheme: (jid: string) => clearChatTheme(sock, jid),

    downloadViewOnce: async (msg: WAMessage) => {
      const raw = msg.message;
      const target = raw?.extendedTextMessage?.contextInfo?.quotedMessage || raw;
      const unwrapped = target?.viewOnceMessageV2?.message || target?.viewOnceMessageV2Extension?.message || target?.viewOnceMessage?.message || target;
      if (!unwrapped) return null;
      const type = unwrapped.imageMessage ? "image" : unwrapped.videoMessage ? "video" : unwrapped.audioMessage ? "audio" : null;
      if (!type) return null;
      const caption = unwrapped.imageMessage?.caption || unwrapped.videoMessage?.caption || undefined;
      const buffer = (await downloadMediaMessage({ key: msg.key, message: unwrapped } as WAMessage, "buffer", {}, { logger: sock.logger, reuploadRequest: sock.updateMediaMessage })) as Buffer;
      return { buffer, type, caption };
    },

    sendButtons: async (jid: string, opts: { title?: string; body: string; footer?: string; imageUrl?: string; buttons: NativeButton[] }, quoted?: WAMessage) => {
      let headerMedia: any = { title: opts.title || "", hasMediaAttachment: false };
      if (opts.imageUrl) {
        const media = await prepareWAMessageMedia({ image: { url: opts.imageUrl } }, { upload: sock.waUploadToServer });
        headerMedia = { ...media, title: opts.title || "", hasMediaAttachment: true };
      }
      const nativeButtons = opts.buttons.map((btn, idx) => {
        if (btn.type === "url") return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: btn.displayText, url: btn.url, merchant_url: btn.url }) };
        if (btn.type === "copy") return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: btn.displayText, id: btn.id || `copy_${idx}`, copy_code: btn.copyCode }) };
        if (btn.type === "call") return { name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: btn.displayText, phone_number: btn.phoneNumber }) };
        if (btn.type === "list") return { name: "single_select", buttonParamsJson: JSON.stringify({ title: btn.displayText, sections: btn.sections || [] }) };
        return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: btn.displayText, id: btn.id || `btn_${idx}` }) };
      });
      const content = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              header: proto.Message.InteractiveMessage.Header.create(headerMedia),
              body: proto.Message.InteractiveMessage.Body.create({ text: opts.body }),
              footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footer || "" }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: nativeButtons }),
            }),
          },
        },
      }, { userJid: sock.user?.id || jid, quoted });
      await sock.relayMessage(jid, content.message!, {
        messageId: content.key.id!,
        additionalNodes: [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { name: "quick_reply" } }] }] }],
      });
      return content;
    },

    sendAudioSticker: async (jid: string, stickerWebpBuffer: Buffer, opusAudioBuffer: Buffer, isAnimated = false, quoted?: WAMessage) => {
      const [stickerMedia, audioMedia] = await Promise.all([
        prepareWAMessageMedia({ sticker: stickerWebpBuffer }, { upload: sock.waUploadToServer }),
        prepareWAMessageMedia({ audio: opusAudioBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true }, { upload: sock.waUploadToServer }),
      ]);
      const stickerMsg: any = stickerMedia.stickerMessage;
      const audioMsg = audioMedia.audioMessage;
      if (!stickerMsg) throw new Error("Failed to upload sticker media");
      if (isAnimated) {
        stickerMsg.isAnimated = true;
        try {
          const thumb = await extractImageThumb(stickerWebpBuffer, 64);
          if (thumb?.buffer) stickerMsg.pngThumbnail = thumb.buffer;
        } catch {}
      }
      stickerMsg.stickerSentTs = Date.now();
      if (audioMsg) {
        audioMsg.mimetype = "audio/ogg; codecs=opus";
        audioMsg.ptt = true;
        stickerMsg.audioMessage = audioMsg;
      }
      const msg = generateWAMessageFromContent(jid, { stickerMessage: stickerMsg }, { quoted, userJid: sock.user?.id || jid });
      await sock.relayMessage(jid, msg.message!, { messageId: msg.key.id! });
      return msg;
    },

    sendImage: (jid: string, source: Buffer | string, caption?: string, viewOnce = false) => sock.sendMessage(jid, { image: typeof source === "string" ? { url: source } : source, caption, viewOnce }),
    sendVideo: (jid: string, source: Buffer | string, caption?: string, viewOnce = false, gifPlayback = false) => sock.sendMessage(jid, { video: typeof source === "string" ? { url: source } : source, caption, viewOnce, gifPlayback }),
    sendAudio: (jid: string, source: Buffer | string, ptt = false) => sock.sendMessage(jid, { audio: typeof source === "string" ? { url: source } : source, ptt, mimetype: "audio/mp4" }),
    sendDocument: (jid: string, source: Buffer | string, fileName: string, mimetype: string) => sock.sendMessage(jid, { document: typeof source === "string" ? { url: source } : source, fileName, mimetype }),
    sendSticker: (jid: string, source: Buffer | string, isAnimated = false) => sock.sendMessage(jid, { sticker: typeof source === "string" ? { url: source } : source, isAnimated }),
    sendPoll: (jid: string, name: string, values: string[], selectableCount = 1) => sock.sendMessage(jid, { poll: { name, values, selectableCount } }),
    react: (jid: string, key: WAMessageKey, emoji: string) => sock.sendMessage(jid, { react: { text: emoji, key } }),
    editMessage: (jid: string, key: WAMessageKey, newText: string) => sock.sendMessage(jid, { text: newText, edit: key }),
    deleteMessage: (jid: string, key: WAMessageKey) => sock.sendMessage(jid, { delete: key }),
    postStatus: (content: AnyMessageContent, statusJidList: string[]) => sock.sendMessage("status@broadcast", content, { statusJidList }),
    sendChannelMessage: (newsletterJid: string, content: AnyMessageContent) => sock.sendMessage(newsletterJid, content),
    followChannel: (newsletterJid: string) => (sock as any).newsletterFollow?.(newsletterJid),
    reactChannel: (newsletterJid: string, serverId: string, reaction: string) => (sock as any).newsletterReactMessage?.(newsletterJid, serverId, reaction),
    createGroup: (subject: string, participants: string[]) => sock.groupCreate(subject, participants),
    groupAction: (groupJid: string, participants: string[], action: "add" | "remove" | "promote" | "demote") => sock.groupParticipantsUpdate(groupJid, participants, action),
    rejectCall: (callId: string, callFrom: string) => sock.rejectCall(callId, callFrom),
    setTyping: (jid: string, isTyping = true) => sock.sendPresenceUpdate(isTyping ? "composing" : "paused", jid),
    sendRaw: (jid: string, content: AnyMessageContent, opts?: MiscMessageGenerationOptions) => sock.sendMessage(jid, content, opts),
  };

  return { sock, ...helpers };
}

export default createVictoryBaileys;
