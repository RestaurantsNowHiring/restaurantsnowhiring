"use client";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, Compass, ExternalLink, FileText, Play, Search, MessagesSquare } from "lucide-react";
import { CANDIDATE_RESOURCE_CATEGORIES, type CandidateResource, visibleResources, youtubeThumbnail } from "../../lib/candidateResources";
import styles from "./candidateResources.module.css";

export default function CandidateResourcesClient({ resources }: { resources: CandidateResource[] }) {
  const [category, setCategory] = useState("All");
  const shown = visibleResources(resources, category);
  return <main className={styles.page}>
    <section className={styles.hero}><span className={styles.eyebrow}>TOOLS FOR YOUR NEXT OPPORTUNITY</span><h1>Candidate Resources</h1><p>Practical videos and articles to help you prepare, stand out, and feel confident throughout your restaurant job search.</p></section>
    <section className={styles.tools} aria-labelledby="candidate-tools-title">
      <div className={styles.sectionHeading}><span className={styles.eyebrow}>CANDIDATE TOOLS</span><h2 id="candidate-tools-title">Take the next step</h2></div>
      <div className={styles.toolGrid}>
        <ToolCard icon={FileText} label="BUILD YOUR RESUME" title="Create a polished restaurant resume in minutes." href="/candidate-resources/resume-builder" action="Build My Resume" />
        <ToolCard icon={MessagesSquare} label="PRACTICE AN INTERVIEW" title="Practice restaurant interview questions and get practical coaching." href="/candidate-resources/interview-practice" action="Start Practicing" />
        <ToolCard icon={Compass} label="EXPLORE RESTAURANT CAREERS" title="Find the restaurant role that fits you." href="/candidate-resources/restaurant-careers" action="Explore Roles" />
        <ToolCard icon={Search} label="FIND YOUR NEXT JOB" title="Browse restaurant opportunities hiring now." href="/jobs" action="Find Restaurant Jobs" />
      </div>
    </section>
    <section className={styles.resources} aria-labelledby="resources-title"><div className={styles.sectionHeading}><span className={styles.eyebrow}>ARTICLES &amp; VIDEOS</span><h2 id="resources-title">Restaurant job-search resources</h2></div></section>
    <nav className={styles.filters} aria-label="Filter resources by category">
      {["All", ...CANDIDATE_RESOURCE_CATEGORIES].map((item) => <button key={item} type="button" aria-pressed={category === item} className={category === item ? styles.activeFilter : ""} onClick={() => setCategory(item)}>{item}</button>)}
    </nav>
    {shown.length ? <section className={styles.grid} aria-live="polite">{shown.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</section> : <div className={styles.empty}>No published resources are available in this category yet. Please check back soon.</div>}
  </main>;
}

function ToolCard({ icon: Icon, label, title, href, action }: { icon: typeof FileText; label: string; title: string; href: string; action: string }) {
  return <article className={styles.toolCard}><Icon size={22} aria-hidden="true" /><span>{label}</span><h3>{title}</h3><Link href={href}>{action} <span aria-hidden="true">→</span></Link></article>;
}

function ResourceCard({ resource }: { resource: CandidateResource }) {
  const thumbnail = resource.thumbnail_url || (resource.resource_type === "video" ? youtubeThumbnail(resource.url) : null);
  return <article className={styles.card}>
    {thumbnail && <div className={styles.image} style={{ backgroundImage: `url(${JSON.stringify(thumbnail).slice(1, -1)})` }} aria-hidden="true" />}
    <div className={styles.cardBody}><div className={styles.meta}>{resource.resource_type === "video" ? <Play size={16} /> : <BookOpen size={16} />} {resource.resource_type === "video" ? "VIDEO" : "ARTICLE"}<span>•</span>{resource.category}</div><h2>{resource.title}</h2>{resource.description && <p>{resource.description}</p>}<div className={styles.source}>Source: {resource.source}</div>{resource.url && <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.action}>{resource.resource_type === "video" ? "Watch Video" : "Read Article"}<ExternalLink size={16} aria-hidden="true" /></a>}</div>
  </article>;
}
