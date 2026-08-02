import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "어제의 핵심",
    short_name: "어제의 핵심",
    description: "어제의 중요한 뉴스를 하루 10분 안에 이해하고 생각하는 개인 뉴스 앱",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3eb",
    theme_color: "#315a47",
    lang: "ko-KR",
    categories: ["news", "education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
