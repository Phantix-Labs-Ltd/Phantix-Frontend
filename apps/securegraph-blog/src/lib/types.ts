export interface IssueMeta {
  name: string;
  number: string;
  date: string;
  folio: string;
  kicker: string;
  deck: string;
  byline: string;
  pullQuote: string;
  pullCite: string;
  newsletterLabel: string;
  newsletterBlurb: string;
  newsletterUrl: string;
}

/** A byline: someone who wrote or rewrote the copy (approvers are not listed). */
export interface Contributor {
  name: string;
  initials: string;
  edits: number;
  first_at: string | null;
  last_at: string | null;
}

/** The compact issue a post belongs to. */
export interface IssueRef {
  id: number;
  slug: string;
  number: string;
  name: string;
  date: string;
}

/** A post as returned by the list endpoint (no markdown body). */
export interface PostSummary {
  slug: string;
  title: string;
  no: string;
  order: number;
  date: string;
  kicker?: string;
  excerpt: string;
  featured?: boolean;
  contributors?: Contributor[];
  issue?: IssueRef | null;
}

/** A full post with its raw markdown body. */
export interface Post extends PostSummary {
  body: string;
}

/** GET /posts — the admin backend's list shape. */
export interface PostsResponse {
  issue?: Partial<IssueMeta>;
  posts: PostSummary[];
}
