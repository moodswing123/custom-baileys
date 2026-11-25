import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { proto, encryptedStream, downloadMediaMessage, WASocket, WAMessage } from "@whiskeysockets/baileys";

const require = createRequire(import.meta.url);

const COLORS: Record<string, string> = {
  red: "FF0000", green: "00FF00", blue: "0000FF", yellow: "FFFF00",
  orange: "FF8000", pink: "FF69B4", purple: "800080", black: "000000",
  white: "FFFFFF", brown: "A52A2A", grey: "808080", gray: "808080",
  cyan: "00FFFF", lime: "00FF00", gold: "FFD700", silver: "C0C0C0",
  maroon: "800000", navy: "000080", teal: "008080", magenta: "FF00FF",
  violet: "8A2BE2", indigo: "4B0082", peach: "FFDAB9", sky: "87CEEB",
  mint: "98FF98", coral: "FF7F50", lavender: "E6E6FA", crimson: "DC143C",
  turquoise: "40E0D0",
};

export const BUBBLE_SCHEMES: Record<string, string> = {
  blue: "Default-Blue@Minimal",
  tonal: "Default-Blue@Tonal@Minimal",
  emerald: "Emerald@Minimal",
  emeraldtonal: "Emerald@Tonal@Minimal",
  pink: "Pink@Minimal",
  red: "Red@Minimal",
  royal: "Royal-Blue@Minimal",
  purple: "Tyrian-Purple@Minimal",
  green: "WhatsApp-Green@Minimal",
};

export function normalizeHex(h: string): string | null {
  const name = String(h || "").trim().toLowerCase();
  if (COLORS[name]) return "#" + COLORS[name] + "FF";
  const s = name.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(s)) return "#" + s + "FF";
  if (/^[0-9A-F]{8}$/.test(s)) return "#" + s;
  return null;
}

export function patchChatThemeProto() {
  const M: any = proto?.Message;
  if (!M || M.__stThemePatched) return;
  const PM = M.ProtocolMessage;
  if (PM) {
    if (PM.Type && PM.Type.CHAT_THEME_SETTING == null) {
      PM.Type.CHAT_THEME_SETTING = 34;
      PM.Type[34] = "CHAT_THEME_SETTING";
    }
    if (typeof PM.encode === "function") {
      const prevEncode = PM.encode;
      PM.encode = function (message: any, writer: any) {
        const cts = message?.chatThemeSetting;
        if (cts && Object.prototype.hasOwnProperty.call(message, "chatThemeSetting")) {
          delete message.chatThemeSetting;
        }
        const w = prevEncode.call(this, message, writer);
        if (cts) {
          message.chatThemeSetting = cts;
          const sub = w.uint32(242).fork();
          if (cts.settingTimestampMs != null) sub.uint32(8).int64(cts.settingTimestampMs);
          if (cts.clearTheme) sub.uint32(16).bool(true);
          if (cts.colorSchemeId) sub.uint32(26).string(cts.colorSchemeId);
          if (cts.solidColor) {
            const sc = sub.uint32(90).fork();
            if (cts.solidColor.backgroundLightArgb != null) sc.uint32(13).fixed32(cts.solidColor.backgroundLightArgb >>> 0);
            if (cts.solidColor.backgroundDarkArgb != null) sc.uint32(21).fixed32(cts.solidColor.backgroundDarkArgb >>> 0);
            if (cts.solidColor.isDoodleEnabled != null) sc.uint32(24).bool(!!cts.solidColor.isDoodleEnabled);
            sc.ldelim();
          }
          if (cts.customImage) {
            const ci = sub.uint32(106).fork();
            if (cts.customImage.directPath) ci.uint32(10).string(cts.customImage.directPath);
            if (cts.customImage.mediaKey) ci.uint32(18).bytes(cts.customImage.mediaKey);
            if (cts.customImage.fileEncSha256) ci.uint32(26).bytes(cts.customImage.fileEncSha256);
            if (cts.customImage.fileSha256) ci.uint32(34).bytes(cts.customImage.fileSha256);
            if (cts.customImage.dimLevel != null) ci.uint32(45).float(cts.customImage.dimLevel);
            ci.ldelim();
          }
          sub.ldelim();
        }
        return w;
      };
    }
    if (typeof PM.fromObject === "function") {
      const prevFromObj = PM.fromObject;
      PM.fromObject = function (obj: any) {
        const msg = prevFromObj.call(this, obj);
        if (obj?.chatThemeSetting) msg.chatThemeSetting = obj.chatThemeSetting;
        return msg;
      };
    }
  }
  M.__stThemePatched = true;
}

export function patchWallpaperMappings() {
  try {
    const b = require("@whiskeysockets/baileys");
    if (b.MEDIA_HKDF_KEY_MAPPING && b.MEDIA_HKDF_KEY_MAPPING["chat-wallpaper-image" as any] == null) {
      b.MEDIA_HKDF_KEY_MAPPING["chat-wallpaper-image" as any] = "Chat Wallpaper";
    }
    if (b.MEDIA_PATH_MAP && b.MEDIA_PATH_MAP["chat-wallpaper-image" as any] == null) {
      b.MEDIA_PATH_MAP["chat-wallpaper-image" as any] = "/mms/image";
    }
  } catch {}
}

export function patchBaileysSendFile(): string {
  try {
    const mainPath = require.resolve("@whiskeysockets/baileys");
    const sendPath = path.join(path.dirname(mainPath), "Socket", "messages-send.js");
    let src = fs.readFileSync(sendPath, "utf8");
    if (src.includes("return 'chat_theme';")) return "present";
    const branch = "        if (message.protocolMessage && message.protocolMessage.type === 34) {\n            return 'chat_theme';\n        }\n";
    const anchor = "    const getMediaType = (message) => {\n        if (message.imageMessage) {";
    if (src.includes(anchor)) {
      src = src.replace(anchor, "    const getMediaType = (message) => {\n" + branch + "        if (message.imageMessage) {");
      fs.writeFileSync(sendPath, src);
      return "patched";
    }
    return "anchor_not_found";
  } catch (e: any) {
    return "failed: " + (e?.message || String(e));
  }
}

patchChatThemeProto();
patchWallpaperMappings();
(globalThis as any).__stThemeServerPatch = patchBaileysSendFile();

export async function sendThemeSetting(sock: WASocket, jid: string, setting: Record<string, any>) {
  patchChatThemeProto();
  await (sock as any).relayMessage(
    jid,
    { protocolMessage: { type: 34, chatThemeSetting: { settingTimestampMs: Date.now(), ...setting } } },
    { additionalAttributes: { type: "media" } }
  );
}

export async function setChatThemeColor(sock: WASocket, jid: string, colorNameOrHex: string, doodle = false) {
  const h = normalizeHex(colorNameOrHex);
  if (!h) throw new Error(`Unknown color: ${colorNameOrHex}`);
  const argb = (0xff000000 | parseInt(h.slice(1, 7), 16)) >>> 0;
  await sendThemeSetting(sock, jid, {
    solidColor: { backgroundLightArgb: argb, backgroundDarkArgb: argb, isDoodleEnabled: doodle },
  });
}

export async function setChatBubbleColor(sock: WASocket, jid: string, schemeName: string) {
  const id = BUBBLE_SCHEMES[schemeName.toLowerCase()] || schemeName;
  await sendThemeSetting(sock, jid, { colorSchemeId: id });
}

export async function clearChatTheme(sock: WASocket, jid: string) {
  await sendThemeSetting(sock, jid, { clearTheme: true });
}

export async function setChatWallpaper(sock: WASocket, jid: string, imageSource: Buffer | { url: string }, dimLevel = 0) {
  patchWallpaperMappings();
  const enc = await encryptedStream(imageSource, "chat-wallpaper-image" as any, { logger: sock.logger });
  let directPath: string | undefined;
  try {
    const up = await sock.waUploadToServer(enc.encFilePath, {
      mediaType: "chat-wallpaper-image" as any as any,
      fileEncSha256B64: enc.fileEncSha256.toString("base64"),
    });
    directPath = up?.directPath;
  } finally {
    await fs.promises.unlink(enc.encFilePath).catch(() => {});
  }
  if (!directPath) throw new Error("Wallpaper upload failed: no directPath returned");
  await sendThemeSetting(sock, jid, {
    customImage: {
      directPath,
      mediaKey: enc.mediaKey,
      fileEncSha256: enc.fileEncSha256,
      fileSha256: enc.fileSha256,
      dimLevel,
    },
  });
}
