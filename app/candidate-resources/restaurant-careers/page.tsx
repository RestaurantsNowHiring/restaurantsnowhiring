import type { Metadata } from "next";
import RestaurantCareersClient from "./RestaurantCareersClient";
import { restaurantCareers } from "../../../lib/restaurantCareers";

export const metadata: Metadata = {
  title: "Restaurant Careers & Job Guides",
  description: "Explore restaurant careers, job responsibilities, skills, interview questions, and career paths for front-of-house, kitchen, and restaurant management roles.",
};

export default function RestaurantCareersPage() {
  return <RestaurantCareersClient careers={restaurantCareers} />;
}
