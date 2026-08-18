"use client";
import { useState } from "react";
import { BookOpen, ExternalLink, Play } from "lucide-react";
import { CANDIDATE_RESOURCE_CATEGORIES, type CandidateResource, visibleResources, youtubeThumbnail } from "../../lib/candidateResources";
import styles from "./candidateResources.module.css";

export default function CandidateResourcesClient({ resources }: { resources: CandidateResource[] }) {
  const [category, setCategory] = useState("All");
  const shown = visibleResources(resources, category);
  return <main className={styles.page}>
    <section className={styles.hero}><span className={styles.eyebrow}>TOOLS FOR YOUR NEXT OPPORTUNITY</span><h1>Candidate Resources</h1><p>Practical videos and articles to help you prepare, stand out, and feel confident throughout your restaurant job search.</p></section>
    <nav className={styles.filters} aria-label="Filter resources by category">
      {["All", ...CANDIDATE_RESOURCE_CATEGORIES].map((item) => <button key={item} type="button" aria-pressed={category === item} className={category === item ? styles.activeFilter : ""} onClick={() => setCategory(item)}>{item}</button>)}
    </nav>
    {shown.length ? <section className={styles.grid} aria-live="polite">{shown.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</section> : <div className={styles.empty}>No published resources are available in this category yet. Please check back soon.</div>}
  </main>;
}

function ResourceCard({ resource }: { resource: CandidateResource }) {
  const thumbnail = resource.thumbnail_url || (resource.resource_type === "video" ? youtubeThumbnail(resource.url) : null);
  return <article className={styles.card}>
    {thumbnail && <div className={styles.image} style={{ backgroundImage: `url(${JSON.stringify(thumbnail).slice(1, -1)})` }} aria-hidden="true" />}
    <div className={styles.cardBody}><div className={styles.meta}>{resource.resource_type === "video" ? <Play size={16} /> : <BookOpen size={16} />} {resource.resource_type === "video" ? "VIDEO" : "ARTICLE"}<span>•</span>{resource.category}</div><h2>{resource.title}</h2>{resource.description && <p>{resource.description}</p>}<div className={styles.source}>Source: {resource.source}</div>{resource.url && <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.action}>{resource.resource_type === "video" ? "Watch Video" : "Read Article"}<ExternalLink size={16} aria-hidden="true" /></a>}</div>
  </article>;
}
