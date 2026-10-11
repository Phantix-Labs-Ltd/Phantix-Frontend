import { useEffect, useState } from "react";
import { fetchPost, fetchPosts, peekPost, peekPosts } from "./content";
import type { IssueMeta, Post, PostSummary } from "./types";

// Both hooks start from content already loaded (a prerendered page primes it),
// so the first render needs no loading state, then refresh from the API. A
// failed refresh keeps what is on screen rather than replacing it with an error.

export function useIssue(): {
  issue: IssueMeta | null;
  posts: PostSummary[];
  loading: boolean;
  error: string | null;
} {
  const [initial] = useState(peekPosts);
  const [issue, setIssue] = useState<IssueMeta | null>(initial?.issue ?? null);
  const [posts, setPosts] = useState<PostSummary[]>(initial?.posts ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPosts()
      .then((r) => {
        if (!active) return;
        setIssue(r.issue);
        setPosts(r.posts);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active || initial) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initial]);

  return { issue, posts, loading, error };
}

export function usePost(slug: string | undefined): {
  post: Post | null;
  loading: boolean;
  error: string | null;
} {
  const [post, setPost] = useState<Post | null>(() => peekPost(slug));
  const [loading, setLoading] = useState(() => Boolean(slug) && !peekPost(slug));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      setLoading(false);
      return;
    }
    let active = true;
    const shown = peekPost(slug);
    setPost(shown);
    setLoading(!shown);
    fetchPost(slug)
      .then((p) => {
        if (!active) return;
        setPost(p);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        const message = e instanceof Error ? e.message : String(e);
        // An essay the editors removed since the page was built is gone, not stale.
        if (!shown || /not found|404/i.test(message)) {
          setPost(null);
          setError(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return { post, loading, error };
}
