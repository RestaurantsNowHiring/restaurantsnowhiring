"use client";
import { useState } from "react";
import Link from "next/link";
import { ChefHat, ClipboardList, ConciergeBell } from "lucide-react";
import { CAREER_CATEGORIES, type CareerCategory, type RestaurantCareer } from "../../../lib/restaurantCareers";
import styles from "./restaurantCareers.module.css";

const icons = { "Front of House": ConciergeBell, "Back of House": ChefHat, "Leadership & Management": ClipboardList };
type Filter = "All Roles" | CareerCategory;

export default function RestaurantCareersClient({ careers }: { careers: RestaurantCareer[] }) {
  const [filter, setFilter] = useState<Filter>("All Roles");
  const shown = filter === "All Roles" ? careers : careers.filter((role) => role.category === filter);
  return <main id="main-content" className={styles.page}>
    <header className={styles.hero}><span>YOUR RESTAURANT CAREER STARTS HERE</span><h1>Explore Restaurant Careers</h1><p>Learn what restaurant jobs involve, the skills employers look for, and how you can grow your career in hospitality.</p></header>
    <section className={styles.explorer} aria-labelledby="explorer-title"><div className={styles.intro}><h2 id="explorer-title">Find a role that fits</h2><p>Whether you&apos;re looking for your first restaurant job or your next leadership opportunity, explore roles to find the right fit.</p></div>
      <nav className={styles.filters} aria-label="Filter restaurant roles">{(["All Roles", ...CAREER_CATEGORIES] as Filter[]).map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</nav>
      <div className={styles.grid} aria-live="polite">{shown.map((role) => { const Icon = icons[role.category]; return <article className={styles.card} key={role.slug}><div className={styles.cardTop}><Icon aria-hidden="true" size={22}/><span>{role.category}</span></div><h3>{role.title}</h3><p>{role.shortDescription}</p><Link href={`/candidate-resources/restaurant-careers/${role.slug}`}>Explore {role.title} <span aria-hidden="true">→</span></Link></article>; })}</div>
    </section>
  </main>;
}
