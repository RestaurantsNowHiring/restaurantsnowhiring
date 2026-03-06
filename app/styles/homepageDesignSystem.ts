import type React from "react";

export const homeTheme = {
  green: "#35806e",
  bg: "#ffffff",
  card: "#f6f5f3",
  border: "rgba(0,0,0,.10)",
  text: "rgba(0,0,0,.85)",
  muted: "rgba(0,0,0,.62)",
};

export const homeCardStyle: React.CSSProperties = {
  backgroundColor: homeTheme.card,
  border: `1px solid ${homeTheme.border}`,
  borderRadius: 18,
  padding: 22,
  boxShadow: "0 18px 40px rgba(0,0,0,.12)",
};

const buttonBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 800,
  fontFamily: "var(--font-body)",
  whiteSpace: "nowrap",
  border: `1px solid ${homeTheme.border}`,
  boxShadow: "0 10px 22px rgba(0,0,0,.10)",
  cursor: "pointer",
  transition: "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease",
};

export const homePrimaryButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: homeTheme.green,
  color: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
};

export const homeSecondaryButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: "#ffffff",
  color: "rgba(0,0,0,.75)",
};
