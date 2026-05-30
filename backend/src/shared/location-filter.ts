/**
 * Checks if a job location represents a job in India.
 * Handles exact matches, case-insensitive searches, and common Indian tech cities/states.
 */
export function isIndiaJob(location: string | null | undefined): boolean {
  if (!location) {
    return false;
  }

  const loc = location.toLowerCase().trim();

  // Direct check for "india"
  if (loc.includes("india") || loc === "in") {
    return true;
  }

  // List of major Indian cities, tech hubs, and states
  const indianLocations = [
    "bengaluru",
    "bangalore",
    "mumbai",
    "delhi",
    "new delhi",
    "hyderabad",
    "pune",
    "chennai",
    "noida",
    "gurugram",
    "gurgaon",
    "kolkata",
    "ahmedabad",
    "jaipur",
    "kochi",
    "coimbatore",
    "indore",
    "chandigarh",
    "karnataka",
    "maharashtra",
    "telangana",
    "tamil nadu",
    "haryana",
    "uttar pradesh",
    "west bengal",
    "kerala",
    "gujarat"
  ];

  return indianLocations.some((cityOrState) => loc.includes(cityOrState));
}
