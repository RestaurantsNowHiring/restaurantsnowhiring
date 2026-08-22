import type { Metadata } from "next";
import ResumeBuilderClient from "./ResumeBuilderClient";
export const metadata: Metadata={title:"Restaurant Resume Builder",description:"Build a professional restaurant resume with role-specific skills, experience suggestions and a printable resume template from Restaurants Now Hiring."};
export default function ResumeBuilderPage(){return <ResumeBuilderClient/>}
