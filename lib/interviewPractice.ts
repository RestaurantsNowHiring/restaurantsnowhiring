export const RESTAURANT_ROLES = ["Server","Bartender","Host / Hostess","Cashier","Line Cook","Prep Cook","Dishwasher","Shift Leader","Kitchen Manager","Restaurant Manager","General Manager","Other"] as const;
export type RestaurantRole = typeof RESTAURANT_ROLES[number];
export type Assessment = "Confident" | "Needs Practice" | "Not Sure";
export type Question = { id:string; category:string; prompt:string; coaching:string[]; tip:string; star?:boolean };
const q=(id:string,category:string,prompt:string,coaching:string[],star=false):Question=>({id,category,prompt,coaching,star,tip:star?"Use a specific example and focus on what you personally did.":"Keep your answer clear, honest, and connected to the role."});
export const GENERAL_QUESTIONS:Question[] = [
 q("intro","Introduction","Tell me about yourself and why you're interested in this position.",["Give a brief, relevant introduction.","Connect your strengths to the position.","Explain what interests you about the opportunity."]),
 q("service","Guest Service","What does great guest service mean to you?",["Describe how guests should feel.","Mention listening and clear communication.","Give a practical example of attentive service."]),
 q("customer","Guest Service","Tell me about a time you dealt with an unhappy customer.",["Briefly explain the situation.","Describe what the customer needed.","Explain the action you personally took.","Show that you stayed calm and professional.","Finish with the outcome or what you learned."],true),
 q("team","Teamwork","Tell me about a time you worked as part of a team.",["Set the scene briefly.","Explain the shared goal.","Describe your contribution.","Share the result."],true),
 q("reliable","Reliability","How do you make sure you're dependable and on time for your shifts?",["Describe how you plan ahead.","Mention communication when problems arise.","Show that teammates can count on you."]),
 q("rush","Situational","You're extremely busy and several guests need your attention at once. What do you do?",["Explain how you prioritize.","Communicate expectations to guests.","Ask teammates for support when appropriate."]),
 q("help","Teamwork","You notice a teammate falling behind during a rush. How would you respond?",["Offer practical help without losing your priorities.","Communicate respectfully.","Keep the whole shift's success in mind."]),
 q("interest","Introduction","What interests you about this restaurant or this type of restaurant?",["Share what you learned about the restaurant.","Connect its service style to your interests.","Be specific and genuine."]),
 q("disagree","Teamwork","How would you handle a disagreement with a coworker during a busy shift?",["Keep service moving first.","Speak calmly and privately when possible.","Focus on a solution, not blame."]),
 q("weekend","Reliability","How would you handle being scheduled during a particularly busy weekend?",["Be honest about availability.","Explain how you prepare for demanding shifts.","Emphasize dependability and communication."])
];
const rolePrompts:Record<Exclude<RestaurantRole,"Other">,string[]> = {
 "Server":["How do you handle multiple tables during a busy shift?","What would you do if you entered a guest's order incorrectly?","How do you make menu recommendations without being pushy?","How would you handle a guest who is unhappy with their service?"],
 "Bartender":["How do you stay organized when the bar becomes busy?","What would you do if a guest appeared intoxicated?","How do you balance speed with accuracy when making drinks?","How would you handle a guest who cannot provide valid identification?"],
 "Host / Hostess":["How would you handle guests who are frustrated about a long wait?","How do you stay organized when managing a waitlist?","How would you handle several parties arriving at the same time?"],
 "Cashier":["How do you maintain accuracy when processing payments quickly?","What would you do if your register was short?","How would you handle a frustrated guest at the counter?"],
 "Line Cook":["How do you stay organized during a rush?","How do you maintain food quality while working quickly?","What would you do if you noticed an unsafe food-handling practice?","How do you communicate with other stations during service?"],
 "Prep Cook":["How do you prioritize prep when several items need to be completed?","How do you maintain consistency when following recipes?","What food-safety practices are most important during prep?"],
 "Dishwasher":["How do you stay organized when dishes begin piling up?","How do you prioritize items the kitchen needs immediately?","How do you maintain sanitation throughout a busy shift?"],
 "Shift Leader":["How would you handle a team member who isn't completing their responsibilities?","How do you keep a team motivated during a difficult shift?","What would you do if you were short-staffed unexpectedly?"],
 "Kitchen Manager":["How do you maintain food quality and consistency?","How do you manage food safety and sanitation standards?","How would you address excessive food waste?","How do you coach a struggling kitchen employee?"],
 "Restaurant Manager":["How do you balance guest satisfaction with operational needs?","Tell me about a time you coached an employee.","How do you handle an understaffed shift?","How do you respond to a serious guest complaint?","How do you build a strong restaurant culture?"],
 "General Manager":["How do you develop restaurant leaders?","How do you approach labor management?","How do you manage food cost and operational performance?","How do you hold managers accountable?","What metrics do you use to evaluate restaurant performance?"]
};
export const ROLE_QUESTIONS = Object.fromEntries(Object.entries(rolePrompts).map(([role,prompts])=>[role,prompts.map((p,i)=>q(`${role}-${i}`,role.includes("Manager")||role==="Shift Leader"?"Leadership":"Role Knowledge",p,["Describe a practical approach.","Explain how you protect guests, quality, and the team.","Include a relevant example when possible."],p.startsWith("Tell me"))) ])) as Record<Exclude<RestaurantRole,"Other">,Question[]>;
export const TOUGH_QUESTIONS:Question[]=[
 q("weakness","Difficult Questions","What is a skill you are currently working to improve?",["Choose a genuine, job-relevant area.","Explain the steps you are taking.","Share progress without disguising a strength as a weakness."]),
 q("leave","Difficult Questions","If you've left a previous job, how would you explain why?",["Keep the explanation brief and professional.","Avoid criticizing a former employer.","Focus on what you want next."]),
 q("mistake","Difficult Questions","Tell me about a time you made a mistake at work, school, or in another responsibility.",["Describe the mistake honestly.","Explain how you fixed it.","Share what you changed afterward."],true),
 q("conflict","Difficult Questions","Tell me about a conflict you handled with another person.",["Explain the disagreement without blaming.","Describe how you listened and responded.","Share the resolution or lesson."],true),
 q("hire","Difficult Questions","Why should we hire you?",["Name two or three strengths relevant to the role.","Support them with evidence.","Show enthusiasm without comparing yourself to others."]),
 q("feedback","Difficult Questions","Tell me about a time you received difficult feedback at work, school, or elsewhere.",["Explain the feedback and your response.","Show openness rather than defensiveness.","Describe what you changed."],true),
 q("gap","Difficult Questions","If there is a gap in your work history, how would you explain it?",["Only answer if this applies to you.","Keep private details private.","Briefly explain and redirect to your readiness for the role."])
];
export const PRACTICE_MODES={quick:{name:"Quick Practice",count:5,description:"A quick confidence boost before your interview."},full:{name:"Full Interview",count:10,description:"Practice a complete restaurant interview from introduction to situational questions."},tough:{name:"Tough Questions",count:5,description:"Practice the questions candidates often find hardest to answer."}} as const;
export type PracticeMode=keyof typeof PRACTICE_MODES;
export function selectQuestions(role:RestaurantRole,mode:PracticeMode){if(mode==="tough")return TOUGH_QUESTIONS.slice(0,5);const roleSet=role==="Other"?[]:ROLE_QUESTIONS[role];const combined=GENERAL_QUESTIONS.flatMap((item,i)=>roleSet[i]?[item,roleSet[i]]:[item]);return combined.slice(0,PRACTICE_MODES[mode].count);}
