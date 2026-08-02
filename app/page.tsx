import { DigestView } from "@/components/digest-view";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getCurrentDigest } from "@/lib/digest/read-digest";

const KOREAN_DATE = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

export default async function TodayPage() {
  await requirePageSession();
  const digest = await getCurrentDigest();
  if (!digest) {
    return (
      <section className="page-stack" aria-labelledby="today-title">
        <div className="eyebrow">어제의 핵심</div>
        <h1 id="today-title">첫 브리핑을 준비하고 있어요</h1>
        <p className="lede">06:45 KST 생성 작업이 끝나면 이곳에 뉴스가 표시됩니다.</p>
      </section>
    );
  }

  return (
    <section className="page-stack today-page" aria-labelledby="today-title">
      <header className="today-header">
        <div>
          <div className="eyebrow">어제의 핵심</div>
          <h1 id="today-title">{KOREAN_DATE.format(new Date(`${digest.sourceDate}T12:00:00+09:00`))}의 뉴스</h1>
        </div>
        <span className="reading-time">약 {digest.readingMinutes}분</span>
      </header>
      <DigestView items={digest.items} sourceDate={digest.sourceDate} />
    </section>
  );
}
