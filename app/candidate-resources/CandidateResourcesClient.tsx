"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BookOpen, ChefHat, ExternalLink, FileText, MessagesSquare, Play, Search } from "lucide-react";
import { CANDIDATE_RESOURCE_CATEGORIES, type CandidateResource, visibleResources, youtubeThumbnail } from "../../lib/candidateResources";
import styles from "./candidateResources.module.css";

const candidateTools: Array<{
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
}> = [
  { title: "BUILD YOUR RESUME", description: "Create a restaurant-ready resume in minutes.", icon: <FileText aria-hidden="true" />, href: "/candidate-resources/resume-builder" },
  { title: "PRACTICE AN INTERVIEW", description: "Practice questions for your restaurant role.", icon: <MessagesSquare aria-hidden="true" /> },
  { title: "EXPLORE RESTAURANT CAREERS", description: "Learn about positions, skills & responsibilities.", icon: <ChefHat aria-hidden="true" /> },
  { title: "FIND YOUR NEXT JOB", description: "Search restaurant opportunities near you.", icon: <Search aria-hidden="true" />, href: "/jobs" },
];

export default function CandidateResourcesClient({ resources }: { resources: CandidateResource[] }) {
  const [category, setCategory] = useState("All");
  const shown = visibleResources(resources, category);

  return <main className={styles.page}>
    <section className={styles.hero}>
      <span className={styles.eyebrow}>TOOLS FOR YOUR NEXT OPPORTUNITY</span>
      <h1>Everything You Need to Land Your Next Restaurant Job</h1>
      <p>Build your resume, prepare for interviews, learn about restaurant roles, and find your next opportunity.</p>
    </section>

    <section className={styles.toolsSection} aria-labelledby="candidate-tools-heading">
      <h2 id="candidate-tools-heading" className={styles.sectionTitle}>Candidate Tools</h2>
      <div className={styles.toolsGrid}>
        {candidateTools.map((tool) => <article className={`${styles.toolCard} ${tool.href ? styles.activeToolCard : ""}`} key={tool.title}>
          <div className={styles.toolIcon}>{tool.icon}</div>
          <h3>{tool.title}</h3>
          <p>{tool.description}</p>
          {tool.href
            ? <Link href={tool.href} className={styles.toolAction}>{tool.title === "BUILD YOUR RESUME" ? "Start Building" : "Browse Jobs"} <span aria-hidden="true">→</span></Link>
            : <span className={styles.comingSoon}>Coming Soon</span>}
        </article>)}
      </div>
    </section>

    <section className={styles.guidesSection} aria-labelledby="career-guides-heading">
      <div className={styles.sectionIntro}>
        <h2 id="career-guides-heading">Restaurant Career Guides</h2>
        <p>Expert tips, guides, videos and resources to help you succeed in your restaurant career.</p>
      </div>
      <nav className={styles.filters} aria-label="Filter resources by category">
        {["All", ...CANDIDATE_RESOURCE_CATEGORIES].map((item) => <button key={item} type="button" aria-pressed={category === item} className={category === item ? styles.activeFilter : ""} onClick={() => setCategory(item)}>{item}</button>)}
      </nav>
      {shown.length
        ? <div className={styles.grid} aria-live="polite">{shown.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div>
        : <div className={styles.empty}>No published resources are available in this category yet. Please check back soon.</div>}
    </section>
  </main>;
}

function ResourceCard({ resource }: { resource: CandidateResource }) {
  const thumbnail = resource.thumbnail_url || (resource.resource_type === "video" ? youtubeThumbnail(resource.url) : null);
  return <article className={styles.card}>
    {thumbnail && <div className={styles.image} style={{ backgroundImage: `url(${JSON.stringify(thumbnail).slice(1, -1)})` }} aria-hidden="true" />}
    <div className={styles.cardBody}>
      <div className={styles.meta}>{resource.resource_type === "video" ? <Play size={16} aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />} {resource.resource_type === "video" ? "VIDEO" : "ARTICLE"}<span>•</span>{resource.category}</div>
      <h3>{resource.title}</h3>
      {resource.description && <p>{resource.description}</p>}
      <div className={styles.source}>Source: {resource.source}</div>
      {resource.url && <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.action}>{resource.resource_type === "video" ? "Watch Video" : "Read Article"}<ExternalLink size={16} aria-hidden="true" /></a>}
    </div>
  </article>;
}
