/*
 * The people who write for the Weekly, for the Article author schema.
 *
 * A post's bylines arrive from the API as names only (the staff id stays
 * server-side). Answer engines and search weigh an author they can verify, so a
 * byline that matches someone here gains their role and public profiles. This
 * mirrors TEAM in the landing site's src/lib/company.ts (phantixlabs.com/company);
 * change both together. A byline with no match is still credited by name.
 */

export interface Author {
  name: string;
  role: string;
  /** Public profiles that identify this person: LinkedIn first. */
  sameAs: string[];
}

export const AUTHORS: Author[] = [
  {
    name: "Ayomiposi Ayoola",
    role: "Founder & CEO",
    sameAs: ["https://www.linkedin.com/in/ayoola-ayomiposi-phantom", "https://github.com/Phantom-Fort"],
  },
  {
    name: "Olakojo Olaoluwa",
    role: "Co-Founder",
    sameAs: ["https://www.linkedin.com/in/sci-sec", "https://github.com/sec-fortress"],
  },
  {
    name: "Fredrick George",
    role: "CTO",
    sameAs: ["https://www.linkedin.com/in/george-fredrick-4b38a9375/"],
  },
  {
    name: "Yisa Silas",
    role: "Head of Security Research",
    sameAs: ["https://www.linkedin.com/in/silas-yisa/"],
  },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The directory entry for a byline, matched on the name (either word order). */
export function findAuthor(name: string): Author | undefined {
  const n = norm(name);
  const reversed = n.split(" ").reverse().join(" ");
  return AUTHORS.find((a) => norm(a.name) === n || norm(a.name) === reversed);
}
