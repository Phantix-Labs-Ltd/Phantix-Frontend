import { Route, Routes } from "react-router-dom";
import { ConsentBanner } from "./components/ConsentBanner";
import { Header } from "./components/Header";
import { NotFoundPage } from "./components/States";
import { ScrollToTop } from "./components/ScrollToTop";
import { useAnalytics } from "./lib/useAnalytics";
import { useCanonicalUrl } from "./lib/useCanonicalUrl";
import { Landing } from "./pages/Landing";
import { Post } from "./pages/Post";

export default function App() {
  useAnalytics();
  useCanonicalUrl("https://blog.phantixlabs.com");

  return (
    <>
      <ScrollToTop />
      <Header />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/posts/:slug" element={<Post />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ConsentBanner />
    </>
  );
}
