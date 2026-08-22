import type { Metadata } from "next";
import InterviewPracticeClient from "./InterviewPracticeClient";
export const metadata:Metadata={title:"Restaurant Interview Practice",description:"Practice restaurant interview questions, get role-specific coaching, and build confidence for your next restaurant job interview."};
export default function InterviewPracticePage(){return <InterviewPracticeClient/>}
