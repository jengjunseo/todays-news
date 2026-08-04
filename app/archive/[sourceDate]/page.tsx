import Link from "next/link";
import { notFound } from "next/navigation";

import { DigestView } from "@/components/digest-view";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getPublishedDigestBySourceDate } from "@/lib/digest/read-digest";
import { isValidKstDateKey } from "@/lib/time/kst";

const KOREAN_DATE = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export default async function ArchivedDigestPage({
  params,
}: {
  params: Promise<{ sourceDate: string }>;
}) {
  await requirePageSession();
  const { sourceDate } = await params;
  if (!isValidKstDateKey(sourceDate)) notFound();

  const digest = await getPublishedDigestBySourceDate(sourceDate);
  if (!digest) notFound();

  return (
    <section className="page-stack today-page" aria-labelledby="archive-digest-title">
      <Link href="/archive" className="save-note">← 지난 뉴스</Link>
      <header className="today-header">
        <div>
          <div className="eyebrow">지난 뉴스</div>
          <h1 id="archive-digest-title">
            {KOREAN_DATE.format(new Date(`${digest.sourceDate}T12:00:00+09:00`))}
          </h1>
        </div>
        <span className="reading-time">약 {digest.readingMinutes}분</span>
      </header>
      <DigestView items={digest.items} sourceDate={digest.sourceDate} persistAsCurrent={false} />
    </section>
  );
}
