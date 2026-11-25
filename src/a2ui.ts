import { generateWAMessageFromContent, prepareWAMessageMedia, proto, WASocket } from "@whiskeysockets/baileys";

export class A2UI {
  public components: any[] = [];
  private headerUrl?: string;

  image(url: string, opts: { variant?: string } = {}) {
    if (opts.variant === "header") this.headerUrl = url;
    const node = { type: "image", url, ...opts };
    return node;
  }

  text(content: string, opts: { variant?: "h1" | "h2" | "body" | "caption" } = {}) {
    return { type: "text", content, variant: opts.variant || "body" };
  }

  column(children: any[]) {
    return { type: "column", children };
  }

  row(children: any[]) {
    return { type: "row", children };
  }

  card(content: any) {
    return { type: "card", content };
  }

  button(label: string, id: string, url?: string) {
    return { type: "button", label, id, url };
  }

  root(nodes: any[]) {
    this.components = nodes;
    return this;
  }

  toMarkdown(): string {
    const lines: string[] = [];
    const render = (node: any) => {
      if (!node) return;
      if (node.type === "text") {
        if (node.variant === "h1") lines.push(`\n*${node.content.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━`);
        else if (node.variant === "h2") lines.push(`\n*▸ ${node.content}*`);
        else if (node.variant === "caption") lines.push(`_${node.content}_`);
        else lines.push(`• ${node.content}`);
      } else if (node.type === "card") {
        lines.push("");
        render(node.content);
      } else if (node.type === "column" || node.type === "row") {
        (node.children || []).forEach(render);
      }
    };
    this.components.forEach(render);
    return lines.join("\n").trim();
  }

  getHeaderImage() {
    return this.headerUrl;
  }
}

export async function sendA2UIWidget(
  sock: WASocket,
  jid: string,
  opts: {
    a2ui: A2UI;
    footer?: string;
    contextInfo?: Record<string, any>;
    singleScreen?: boolean;
    buttons?: Array<{ name: string; buttonParamsJson: string }>;
  }
) {
  const bodyText = opts.a2ui.toMarkdown();
  const headerUrl = opts.a2ui.getHeaderImage();
  let headerMedia: any = { title: "", hasMediaAttachment: false };

  if (headerUrl) {
    const media = await prepareWAMessageMedia({ image: { url: headerUrl } }, { upload: sock.waUploadToServer });
    headerMedia = { ...media, title: "", hasMediaAttachment: true };
  }

  const nativeButtons = opts.buttons || [
    {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ display_text: "Refresh", id: "a2ui_refresh" }),
    },
  ];

  const content = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            header: proto.Message.InteractiveMessage.Header.create(headerMedia),
            body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footer || "" }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: nativeButtons,
            }),
            contextInfo: opts.contextInfo,
          }),
        },
      },
    },
    { userJid: sock.user?.id || jid }
  );

  await sock.relayMessage(jid, content.message!, {
    messageId: content.key.id!,
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { name: "quick_reply" } }],
          },
        ],
      },
    ],
  });

  return content;
}
