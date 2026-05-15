const BRAND = {
  green: "#35806e",
  darkGreen: "#276455",
  cream: "#f7f2e8",
  warmCard: "#fffaf1",
  ink: "#1f2a26",
  muted: "#5f6f67",
  border: "#dfe6dc",
  gold: "#d8ad57",
};

export type EmailContextRow = {
  label: string;
  value: string;
};

export type BrandedEmailOptions = {
  preheader?: string;
  eyebrow?: string;
  title: string;
  intro: string;
  bodyHtml?: string;
  cta?: {
    label: string;
    href: string;
  };
  contextRows?: EmailContextRow[];
  footerNote?: string;
};

export function normalizeEmailText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderContextRows(rows: EmailContextRow[] | undefined) {
  if (!rows?.length) return "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:28px 0;background:#ffffff;border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;">
      ${rows
        .map((row, index) => {
          const border = index === 0 ? "" : `border-top:1px solid ${BRAND.border};`;
          return `
            <tr>
              <td style="${border}padding:14px 18px;width:42%;font-size:12px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:${BRAND.muted};">${escapeHtml(row.label)}</td>
              <td style="${border}padding:14px 18px;font-size:15px;line-height:1.45;font-weight:800;color:${BRAND.ink};text-align:right;word-break:break-word;">${escapeHtml(row.value)}</td>
            </tr>`;
        })
        .join("")}
    </table>`;
}

export function buildBrandedEmailHtml(options: BrandedEmailOptions) {
  const preheader = options.preheader ? escapeHtml(options.preheader) : "";
  const eyebrow = escapeHtml(options.eyebrow ?? "Restaurant Hiring Platform");
  const title = escapeHtml(options.title);
  const intro = escapeHtml(options.intro);
  const footerNote = escapeHtml(options.footerNote ?? "Hiring built for restaurants.");
  const cta = options.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px auto 8px;">
        <tr>
          <td align="center" style="border-radius:999px;background:${BRAND.green};box-shadow:0 12px 24px rgba(53,128,110,.24);">
            <a class="rn-email-button" href="${escapeHtml(options.cta.href)}" style="display:inline-block;padding:17px 30px;border-radius:999px;background:${BRAND.green};color:#ffffff;font-size:16px;line-height:1.2;font-weight:900;text-decoration:none;letter-spacing:.01em;">${escapeHtml(options.cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <title>${title}</title>
    <style>
      @media (hover: hover) {
        .rn-email-button:hover { background: ${BRAND.darkGreen} !important; }
      }
      @media screen and (max-width: 640px) {
        .rn-email-shell { padding: 18px 10px !important; }
        .rn-email-card { border-radius: 22px !important; }
        .rn-email-header, .rn-email-body, .rn-email-footer { padding-left: 22px !important; padding-right: 22px !important; }
        .rn-email-title { font-size: 30px !important; }
        .rn-email-brand { font-size: 23px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.cream};-webkit-text-size-adjust:100%;text-size-adjust:100%;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.cream};border-collapse:collapse;">
      <tr>
        <td class="rn-email-shell" align="center" style="padding:36px 14px;">
          <table role="presentation" class="rn-email-card" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:separate;border-spacing:0;background:${BRAND.warmCard};border:1px solid rgba(53,128,110,.18);border-radius:28px;overflow:hidden;box-shadow:0 22px 50px rgba(31,42,38,.10);">
            <tr>
              <td class="rn-email-header" style="padding:34px 38px 28px;background:${BRAND.green};background-image:linear-gradient(135deg,${BRAND.green},#3f927d);color:#ffffff;text-align:center;">
                <div class="rn-email-brand" style="font-size:26px;line-height:1.1;font-weight:950;letter-spacing:-.03em;">Restaurants<span style="letter-spacing:-.04em;">NOW</span>Hiring.com</div>
                <div style="width:58px;height:3px;background:${BRAND.gold};border-radius:999px;margin:15px auto 13px;"></div>
                <div style="font-size:13px;line-height:1.35;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:rgba(255,255,255,.88);">${eyebrow}</div>
              </td>
            </tr>
            <tr>
              <td class="rn-email-body" style="padding:38px 42px 34px;text-align:left;">
                <h1 class="rn-email-title" style="margin:0;text-align:center;font-size:36px;line-height:1.05;letter-spacing:-.04em;font-weight:950;color:${BRAND.ink};">${title}</h1>
                <p style="margin:18px auto 0;max-width:500px;text-align:center;font-size:17px;line-height:1.65;font-weight:700;color:${BRAND.muted};">${intro}</p>
                <p style="margin:14px auto 0;max-width:500px;text-align:center;font-size:14px;line-height:1.55;font-weight:700;color:${BRAND.green};">Built for restaurant operators, hiring managers, and restaurant teams.</p>
                ${options.bodyHtml ? `<div style="margin-top:28px;font-size:16px;line-height:1.7;font-weight:650;color:${BRAND.ink};">${options.bodyHtml}</div>` : ""}
                ${renderContextRows(options.contextRows)}
                ${cta}
              </td>
            </tr>
            <tr>
              <td class="rn-email-footer" style="padding:22px 38px 28px;border-top:1px solid rgba(53,128,110,.16);text-align:center;background:#fbf6ec;">
                <div style="font-size:15px;line-height:1.4;font-weight:950;color:${BRAND.green};">Restaurants<span style="letter-spacing:-.03em;">NOW</span>Hiring.com</div>
                <div style="margin-top:5px;font-size:13px;line-height:1.5;font-weight:700;color:${BRAND.muted};">${footerNote}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildBrandedEmailText(options: BrandedEmailOptions) {
  const lines = [
    "RestaurantsNOWHiring.com",
    options.eyebrow ?? "Restaurant Hiring Platform",
    "",
    options.title,
    "",
    options.intro,
    "Built for restaurant operators, hiring managers, and restaurant teams.",
  ];

  if (options.contextRows?.length) {
    lines.push("", "Account details:");
    options.contextRows.forEach((row) => lines.push(`${row.label}: ${row.value}`));
  }

  if (options.cta) lines.push("", `${options.cta.label}: ${options.cta.href}`);
  lines.push("", "RestaurantsNOWHiring.com", options.footerNote ?? "Hiring built for restaurants.");

  return lines.join("\n");
}
