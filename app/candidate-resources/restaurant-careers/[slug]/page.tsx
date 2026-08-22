import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { getRestaurantCareer, restaurantCareers } from "../../../../lib/restaurantCareers";
import { absoluteUrl, serializeJsonLd } from "../../../../lib/seo";
import styles from "../restaurantCareers.module.css";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return restaurantCareers.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const role = getRestaurantCareer((await params).slug);
  if (!role) return {};
  return { title: `${role.title} Job Description & Career Guide`, description: role.metadataDescription };
}

export default async function CareerGuide({ params }: Props) {
  const role = getRestaurantCareer((await params).slug); if (!role) notFound();
  const breadcrumb = { "@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement:[
    {"@type":"ListItem",position:1,name:"Candidate Resources",item:absoluteUrl("/candidate-resources")},
    {"@type":"ListItem",position:2,name:"Restaurant Careers",item:absoluteUrl("/candidate-resources/restaurant-careers")},
    {"@type":"ListItem",position:3,name:role.title,item:absoluteUrl(`/candidate-resources/restaurant-careers/${role.slug}`)}] };
  return <main id="main-content" className={styles.detailPage}><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(breadcrumb)}}/><div className={styles.detailWrap}>
    <Link className={styles.back} href="/candidate-resources/restaurant-careers">← Explore All Restaurant Careers</Link>
    <header className={styles.roleHero}><span>{role.category}</span><h1>{role.title}</h1><p>{role.overview}</p></header>
    <dl className={styles.summary}><div><dt>Category</dt><dd>{role.category}</dd></div><div><dt>Experience</dt><dd>{role.experienceLevel}</dd></div><div><dt>Key Skills</dt><dd>{role.skills.slice(0,3).join(" • ")}</dd></div></dl>
    <div className={styles.contentGrid}><section className={styles.section}><h2>What You&apos;ll Do</h2><ul className={styles.checkList}>{role.responsibilities.map((item)=><li key={item}><Check aria-hidden="true" size={18}/><span>{item}</span></li>)}</ul></section><section className={styles.section}><h2>Skills Employers Look For</h2><ul className={styles.skills}>{role.skills.map((item)=><li key={item}>{item}</li>)}</ul></section></div>
    <section className={styles.section}><h2>What the Job Is Like</h2><p>{role.workEnvironment}</p></section>
    <section className={styles.section}><h2>Do You Need Experience?</h2><p>{role.experienceGuidance}</p></section>
    <section className={styles.section}><h2>Good Fit If...</h2><p><strong>This role may be a good fit if you:</strong></p><ul className={styles.checkList}>{role.goodFit.map((item)=><li key={item}><Check aria-hidden="true" size={18}/><span>{item}</span></li>)}</ul></section>
    <section className={styles.section}><h2>Common {role.title} Interview Questions</h2><ol className={styles.questions}>{role.interviewQuestions.map((item)=><li key={item}>{item}</li>)}</ol><Link className={styles.primaryButton} href="/candidate-resources/interview-practice">Practice a {role.title} Interview <span aria-hidden="true">→</span></Link></section>
    <section className={styles.toolCallout}><div><h2>Applying for {role.title} jobs?</h2><p>Create a restaurant-ready resume using responsibilities and skills relevant to the role.</p></div><Link className={styles.secondaryButton} href="/candidate-resources/resume-builder">Build Your Resume <span aria-hidden="true">→</span></Link></section>
    <section className={styles.section}><h2>Career Growth</h2><p>Possible career paths include:</p><ol className={styles.path}>{role.careerPath.map((item,index)=><li key={item}><span>{item}</span>{index < role.careerPath.length-1 && <ChevronRight aria-hidden="true"/>}</li>)}</ol><p className={styles.note}>Restaurant careers can develop in many directions; this is one possible example, not a required path.</p></section>
    <section className={styles.jobsCta}><h2>Ready to Find Your Next {role.title} Job?</h2><p>Browse restaurant opportunities and find a role that fits what you&apos;re looking for.</p><Link href="/jobs">Find {role.title} Jobs <span aria-hidden="true">→</span></Link></section>
  </div></main>;
}
