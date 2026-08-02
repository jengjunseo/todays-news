import Link from "next/link";

import { requirePageSession } from "@/lib/auth/page-guard";
import { listPublishedDigests } from "@/lib/digest/read-digest";

export default async function ArchivePage() {
  await requirePageSession();
  const digests = await listPublishedDigests();
  return (
    <section className="page-stack" aria-labelledby="archive-title">
      <div className="eyebrow">날짜별 기록</div>
      <h1 id="archive-title">지난 뉴스</h1>
      <p className="lede">발행된 브리핑을 날짜 순으로 다시 봅니다.</p>
      <div className="archive-list">
        {digests.map((digest) => (
          <Link href="/" className="archive-row" key={digest.id}>
            <span><strong>{digest.sourceDate}</strong><small>{digest.itemCount}개 핵심 · 약 {digest.readingMinutes}분</small></span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
