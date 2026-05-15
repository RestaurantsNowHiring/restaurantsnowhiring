export type RestaurantRolePage = {
  slug: string;
  label: string;
  pluralLabel: string;
  headline: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  noJobsMessage: string;
  roleCategories: string[];
  titleKeywords: string[];
  relatedSlugs: string[];
};

export const restaurantRolePages = [
  {
    slug: "cashier-jobs",
    label: "Cashier",
    pluralLabel: "Cashier Jobs",
    headline: "Cashier Jobs at Restaurants Hiring Now",
    metaTitle: "Restaurant Cashier Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant cashier jobs hiring now. Find front-of-house cashier openings and apply on RestaurantsNowHiring.com.",
    intro:
      "Restaurant cashiers keep the guest experience moving from the first greeting through checkout. Browse active cashier openings for quick-service restaurants, cafes, bars, and local dining teams hiring now.",
    noJobsMessage:
      "There are no active approved cashier openings right now, but new restaurant cashier jobs can appear as employers post and approve listings.",
    roleCategories: ["Cashier"],
    titleKeywords: ["cashier", "counter", "front counter", "register"],
    relatedSlugs: ["server-jobs", "shift-leader-jobs", "restaurant-manager-jobs"],
  },
  {
    slug: "line-cook-jobs",
    label: "Line Cook",
    pluralLabel: "Line Cook Jobs",
    headline: "Line Cook Jobs at Restaurants Hiring Now",
    metaTitle: "Restaurant Line Cook Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant line cook jobs hiring now. Find kitchen openings and apply on RestaurantsNowHiring.com.",
    intro:
      "Line cooks are essential to fast, consistent kitchen service. Explore active line cook openings for restaurants looking for cooks who can prepare stations, work the rush, and plate great food.",
    noJobsMessage:
      "There are no active approved line cook openings right now. Check back soon for new kitchen roles from restaurants hiring line cooks.",
    roleCategories: ["Line"],
    titleKeywords: ["line cook", "line chef", "cook"],
    relatedSlugs: ["prep-cook-jobs", "dishwasher-jobs", "restaurant-manager-jobs"],
  },
  {
    slug: "prep-cook-jobs",
    label: "Prep Cook",
    pluralLabel: "Prep Cook Jobs",
    headline: "Prep Cook Jobs at Restaurants Hiring Now",
    metaTitle: "Restaurant Prep Cook Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant prep cook jobs hiring now. Find food prep openings and apply on RestaurantsNowHiring.com.",
    intro:
      "Prep cooks help kitchens stay organized, stocked, and ready for service. Find active prep cook jobs for restaurants that need reliable team members for chopping, portioning, batch prep, and station support.",
    noJobsMessage:
      "There are no active approved prep cook openings right now. New restaurant prep jobs may be added as employers publish approved listings.",
    roleCategories: ["Prep"],
    titleKeywords: ["prep cook", "prep", "food prep", "preparation cook"],
    relatedSlugs: ["line-cook-jobs", "dishwasher-jobs", "shift-leader-jobs"],
  },
  {
    slug: "dishwasher-jobs",
    label: "Dishwasher",
    pluralLabel: "Dishwasher Jobs",
    headline: "Dishwasher Jobs at Restaurants Hiring Now",
    metaTitle: "Restaurant Dishwasher Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant dishwasher jobs hiring now. Find dish, porter, and steward openings on RestaurantsNowHiring.com.",
    intro:
      "Dishwashers keep the back of house running by maintaining clean dishes, tools, and work areas. Browse active dishwasher openings at restaurants hiring dependable support staff now.",
    noJobsMessage:
      "There are no active approved dishwasher openings right now. Check back for new dish, steward, and kitchen support jobs.",
    roleCategories: ["Dishwasher"],
    titleKeywords: ["dishwasher", "dish washer", "steward", "porter", "dish"],
    relatedSlugs: ["prep-cook-jobs", "line-cook-jobs", "shift-leader-jobs"],
  },
  {
    slug: "server-jobs",
    label: "Server",
    pluralLabel: "Server Jobs",
    headline: "Server Jobs at Restaurants Hiring Now",
    metaTitle: "Restaurant Server Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant server jobs hiring now. Find waiter, waitress, and front-of-house openings on RestaurantsNowHiring.com.",
    intro:
      "Servers create welcoming dining experiences while helping restaurants deliver attentive hospitality. Explore active restaurant server jobs for front-of-house teams hiring now.",
    noJobsMessage:
      "There are no active approved server openings right now. New waiter, waitress, and front-of-house roles may be posted soon.",
    roleCategories: ["Server"],
    titleKeywords: ["server", "waiter", "waitress", "front of house", "foh"],
    relatedSlugs: ["cashier-jobs", "shift-leader-jobs", "restaurant-manager-jobs"],
  },
  {
    slug: "restaurant-manager-jobs",
    label: "Restaurant Manager",
    pluralLabel: "Restaurant Manager Jobs",
    headline: "Restaurant Manager Jobs Hiring Now",
    metaTitle: "Restaurant Manager Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant manager jobs hiring now. Find general manager, assistant manager, and restaurant leadership openings.",
    intro:
      "Restaurant managers lead teams, support service standards, and keep daily operations on track. Browse active restaurant manager openings for employers looking for experienced hospitality leaders.",
    noJobsMessage:
      "There are no active approved restaurant manager openings right now. Check back for new general manager, assistant manager, and leadership listings.",
    roleCategories: ["Manager"],
    titleKeywords: ["manager", "general manager", "assistant manager", "gm", "agm"],
    relatedSlugs: ["shift-leader-jobs", "server-jobs", "line-cook-jobs"],
  },
  {
    slug: "shift-leader-jobs",
    label: "Shift Leader",
    pluralLabel: "Shift Leader Jobs",
    headline: "Shift Leader Jobs at Restaurants Hiring Now",
    metaTitle: "Restaurant Shift Leader Jobs Hiring Now",
    metaDescription:
      "Browse active approved restaurant shift leader jobs hiring now. Find shift lead and supervisor openings on RestaurantsNowHiring.com.",
    intro:
      "Shift leaders bridge hourly teams and restaurant management by guiding shifts, supporting guests, and keeping operations organized. Find active shift leader and supervisor openings hiring now.",
    noJobsMessage:
      "There are no active approved shift leader openings right now. New shift lead and supervisor roles may be added soon.",
    roleCategories: ["Shift Leader", "Shift Lead", "Supervisor"],
    titleKeywords: ["shift leader", "shift lead", "supervisor", "team lead"],
    relatedSlugs: ["restaurant-manager-jobs", "cashier-jobs", "server-jobs"],
  },
] satisfies RestaurantRolePage[];

export const restaurantRolePageSlugs = restaurantRolePages.map((role) => role.slug);

export function getRestaurantRolePage(slug: string | null | undefined) {
  return restaurantRolePages.find((role) => role.slug === slug) ?? null;
}
