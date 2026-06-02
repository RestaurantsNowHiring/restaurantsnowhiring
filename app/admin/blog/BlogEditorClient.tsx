"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BLOG_CATEGORIES, type BlogPost, type BlogPostInput } from "../../../lib/blogPosts";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

type Props = { post?: BlogPost | null };

type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "undo"
  | "redo"
  | "createLink"
  | "fontSize"
  | "formatBlock";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BlogEditorClient({ post }: Props) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<BlogPostInput>({
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    category: post?.category ?? BLOG_CATEGORIES[0],
    excerpt: post?.excerpt ?? "",
    meta_title: post?.meta_title ?? "",
    meta_description: post?.meta_description ?? "",
    content: post?.content ?? "",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(post?.id);
  const endpoint = isEditing ? `/api/admin/blog/${encodeURIComponent(post!.id)}` : "/api/admin/blog";

  const fieldStyle = useMemo(() => ({
    width: "100%",
    border: `1px solid ${homeTheme.border}`,
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    color: homeTheme.text,
    backgroundColor: "#fff",
    boxSizing: "border-box" as const,
  }), []);

  const toolbarButtonStyle = useMemo(() => ({
    border: `1px solid ${homeTheme.border}`,
    borderRadius: 10,
    padding: "8px 10px",
    minWidth: 40,
    backgroundColor: "#fff",
    color: homeTheme.green,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
  }), []);

  const editorStyle = useMemo(() => ({
    ...fieldStyle,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    minHeight: 520,
    padding: "22px 24px",
    lineHeight: 1.75,
    overflowY: "auto" as const,
  }), [fieldStyle]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = post?.content ?? "";
    }
  }, [post?.content]);

  function updateField<Key extends keyof BlogPostInput>(key: Key, value: BlogPostInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function syncEditorContent() {
    const content = editorRef.current?.innerHTML ?? "";
    updateField("content", content);
    return content;
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function runEditorCommand(command: EditorCommand, value?: string) {
    focusEditor();
    document.execCommand(command, false, value);
    syncEditorContent();
  }

  function addLink() {
    const selectedText = window.getSelection()?.toString().trim();
    const url = window.prompt("Enter the link URL", selectedText?.startsWith("http") ? selectedText : "https://");
    if (!url) return;

    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    runEditorCommand("createLink", normalizedUrl);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveState === "saving") return;

    setSaveState("saving");
    setError(null);
    setMessage(null);

    const payload = { ...form, content: syncEditorContent() };
    const response = await fetch(endpoint, {
      method: isEditing ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; post?: BlogPost } | null;

    if (!response.ok || !body?.post) {
      setError(body?.error || "Could not save blog draft.");
      setSaveState("idle");
      return;
    }

    setMessage("Draft saved.");
    setSaveState("idle");

    if (!isEditing) {
      router.replace(`/admin/blog/${body.post.id}`);
      router.refresh();
    } else {
      router.refresh();
    }
  }

  return (
    <section style={homeCardStyle}>
      <form onSubmit={saveDraft} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="blog-title" style={{ fontWeight: 800, color: homeTheme.text }}>Title</label>
          <input
            id="blog-title"
            value={form.title}
            onChange={(event) => {
              const title = event.target.value;
              setForm((current) => ({ ...current, title, slug: current.slug || slugify(title) }));
            }}
            style={fieldStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="blog-slug" style={{ fontWeight: 800, color: homeTheme.text }}>Slug</label>
            <input id="blog-slug" value={form.slug} onChange={(event) => updateField("slug", slugify(event.target.value))} style={fieldStyle} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="blog-category" style={{ fontWeight: 800, color: homeTheme.text }}>Category</label>
            <select id="blog-category" value={form.category} onChange={(event) => updateField("category", event.target.value)} style={fieldStyle}>
              {BLOG_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="blog-excerpt" style={{ fontWeight: 800, color: homeTheme.text }}>Excerpt</label>
          <textarea id="blog-excerpt" value={form.excerpt} onChange={(event) => updateField("excerpt", event.target.value)} rows={3} style={fieldStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="blog-meta-title" style={{ fontWeight: 800, color: homeTheme.text }}>Meta title</label>
            <input id="blog-meta-title" value={form.meta_title} onChange={(event) => updateField("meta_title", event.target.value)} style={fieldStyle} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="blog-meta-description" style={{ fontWeight: 800, color: homeTheme.text }}>Meta description</label>
            <textarea id="blog-meta-description" value={form.meta_description} onChange={(event) => updateField("meta_description", event.target.value)} rows={3} style={fieldStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="blog-content" style={{ fontWeight: 800, color: homeTheme.text }}>Article content</label>
          <div style={{ border: `1px solid ${homeTheme.border}`, borderRadius: 14, overflow: "hidden", backgroundColor: "#fff" }}>
            <div
              aria-label="Article formatting toolbar"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                padding: 12,
                borderBottom: `1px solid ${homeTheme.border}`,
                backgroundColor: "rgba(53,128,110,.06)",
              }}
            >
              <select
                aria-label="Text style"
                defaultValue="p"
                onChange={(event) => runEditorCommand("formatBlock", event.target.value)}
                style={{ ...fieldStyle, width: "auto", minWidth: 150, padding: "8px 10px", borderRadius: 10, fontSize: 14, fontWeight: 800, color: homeTheme.green }}
              >
                <option value="p">Paragraph</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
                <option value="h4">Heading 4</option>
              </select>
              <select
                aria-label="Font size"
                defaultValue="3"
                onChange={(event) => runEditorCommand("fontSize", event.target.value)}
                style={{ ...fieldStyle, width: "auto", minWidth: 130, padding: "8px 10px", borderRadius: 10, fontSize: 14, fontWeight: 800, color: homeTheme.green }}
              >
                <option value="2">Small</option>
                <option value="3">Normal</option>
                <option value="4">Large</option>
                <option value="5">Extra large</option>
              </select>
              <button type="button" onClick={() => runEditorCommand("bold")} style={toolbarButtonStyle} aria-label="Bold"><strong>B</strong></button>
              <button type="button" onClick={() => runEditorCommand("italic")} style={toolbarButtonStyle} aria-label="Italic"><em>I</em></button>
              <button type="button" onClick={() => runEditorCommand("underline")} style={toolbarButtonStyle} aria-label="Underline"><span style={{ textDecoration: "underline" }}>U</span></button>
              <button type="button" onClick={() => runEditorCommand("insertUnorderedList")} style={toolbarButtonStyle}>• List</button>
              <button type="button" onClick={() => runEditorCommand("insertOrderedList")} style={toolbarButtonStyle}>1. List</button>
              <button type="button" onClick={addLink} style={toolbarButtonStyle}>Link</button>
              <button type="button" onClick={() => runEditorCommand("undo")} style={toolbarButtonStyle}>Undo</button>
              <button type="button" onClick={() => runEditorCommand("redo")} style={toolbarButtonStyle}>Redo</button>
            </div>
            <div
              id="blog-content"
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-label="Article content"
              aria-multiline="true"
              onInput={syncEditorContent}
              onBlur={syncEditorContent}
              style={editorStyle}
            />
          </div>
          <p style={{ margin: 0, color: homeTheme.muted, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
            Draft content is saved as HTML in the existing content field and is only available inside the admin blog workspace.
          </p>
        </div>

        {error && <div role="alert" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(173,67,67,.24)", color: "#8a2f2f", backgroundColor: "rgba(173,67,67,.08)", fontWeight: 700 }}>{error}</div>}
        {message && <div role="status" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(53,128,110,.24)", color: homeTheme.green, backgroundColor: "rgba(53,128,110,.08)", fontWeight: 700 }}>{message}</div>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={homePrimaryButton} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save Draft"}
          </button>
          <button type="button" style={homeSecondaryButton} onClick={() => router.push("/admin/blog")}>
            Back to drafts
          </button>
        </div>
      </form>
    </section>
  );
}
