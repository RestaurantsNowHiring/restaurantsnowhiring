const ALLOWED_RICH_TEXT_TAGS = new Set(["b", "strong", "i", "em", "ul", "ol", "li", "p", "br", "h3"]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isRichTextHtml(value: string | null | undefined) {
  return /<\/?(?:b|strong|i|em|ul|ol|li|p|br|h3)(?:\s[^>]*)?>/i.test(value ?? "");
}

export function plainTextToRichText(value: string | null | undefined) {
  const text = value ?? "";
  if (!text.trim()) return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeRichText(value: string | null | undefined) {
  const raw = value ?? "";
  if (!raw.trim()) return "";

  return raw
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (match, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_RICH_TEXT_TAGS.has(tag)) return "";
      const closing = /^<\s*\//.test(match) ? "/" : "";
      return `<${closing}${tag}>`;
    });
}

export function normalizeRichTextForEditing(value: string | null | undefined) {
  const raw = value ?? "";
  return isRichTextHtml(raw) ? sanitizeRichText(raw) : plainTextToRichText(raw);
}
