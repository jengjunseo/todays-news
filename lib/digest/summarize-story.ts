import { createHash } from "node:crypto";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { AiSdkStructuredGenerator } from "@/lib/ai/structured-generator";
import {
  AiDigestSelectionSchema,
  DigestItemSchema,
  type DigestItem,
} from "@/lib/digest/schemas";
import type { StoryCluster } from "@/lib/news/cluster";
import type { NewsCategory } from "@/lib/news/types";

const CATEGORY_LABEL: Record<NewsCategory, string> = {
  politics: "정치",
  society: "사회",
  science: "과학",
  technology: "IT·정보",
  economy: "경제",
};

type GroundedSource = {
  id: string;
  articleId: string;
  clusterId: string;
  title: string;
  description: string;
  url: string;
  domain: string;
  publishedAt: string;
};

function groundedSources(candidates: StoryCluster[]) {
  let index = 0;
  return candidates.flatMap((cluster) =>
    cluster.articles.map((article): GroundedSource => ({
      id: `S${++index}`,
      articleId: article.id,
      clusterId: cluster.id,
      title: article.title,
      description: article.description,
      url: article.canonicalUrl,
      domain: article.sourceDomain,
      publishedAt: article.publishedAt,
    })),
  );
}

function buildPrompt(
  category: NewsCategory,
  candidates: StoryCluster[],
  sources: GroundedSource[],
) {
  return `당신은 한 사람을 위한 한국어 뉴스 편집자입니다.
분야: ${CATEGORY_LABEL[category]}

아래 후보 사건에서 정말 중요한 사건만 0~2개 고르세요. 많은 사람의 실제 영향, 실질적 변화, 장기 영향, 여러 출처 확인, 결정과 결과를 우선합니다. 말싸움, 유명인, 논란, 자극적 제목, 루머는 제외합니다.

고등학생이 이해할 수 있는 차분한 한국어로 쓰되 유치하게 쓰지 마세요. 사실·주장·전망을 구분하고, 정답을 유도하지 않는 소크라테스식 질문을 만드세요. 정치적 편향 표현을 피하고, 과학의 초기 연구·경제 전망·기업 발표는 확정 사실처럼 쓰지 마세요.

반드시 아래 clusterId와 source ID만 그대로 사용하세요. URL은 출력하지 마세요.

후보:
${JSON.stringify(
  candidates.map((cluster) => ({
    clusterId: cluster.id,
    title: cluster.representativeTitle,
    score: cluster.deterministicScore,
    sourceCount: cluster.sourceCount,
  })),
  null,
  2,
)}

출처:
${JSON.stringify(sources, null, 2)}`;
}

function validateGrounding(
  output: unknown,
  category: NewsCategory,
  candidates: StoryCluster[],
  sources: GroundedSource[],
) {
  const parsed = AiDigestSelectionSchema.parse(output);
  const clusterIds = new Set(candidates.map((candidate) => candidate.id));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seenClusters = new Set<string>();

  return parsed.items.map((item, index) => {
    if (!clusterIds.has(item.clusterId)) throw new Error("후보 밖 cluster ID입니다.");
    if (seenClusters.has(item.clusterId)) throw new Error("중복 cluster ID입니다.");
    seenClusters.add(item.clusterId);

    const uniqueSourceIds = [...new Set(item.sourceIds)];
    for (const sourceId of uniqueSourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) throw new Error("입력에 없는 source ID입니다.");
      if (source.clusterId !== item.clusterId) throw new Error("다른 사건의 source ID입니다.");
    }

    return DigestItemSchema.parse({
      ...item,
      id: createHash("sha256")
        .update(`${candidates[0]?.targetDate}:${item.clusterId}`)
        .digest("hex")
        .slice(0, 24),
      category,
      rank: index + 1,
      sourceIds: uniqueSourceIds.map((sourceId) => sourceById.get(sourceId)!.articleId),
    });
  });
}

class FixtureSummaryGenerator implements StructuredGenerator {
  constructor(
    private readonly candidates: StoryCluster[],
    private readonly sources: GroundedSource[],
  ) {}

  async generate() {
    return {
      items: this.candidates.slice(0, 2).map((cluster) => {
        const clusterSources = this.sources.filter((source) => source.clusterId === cluster.id);
        const descriptions = cluster.articles.map((article) => article.description);
        return {
          clusterId: cluster.id,
          headline: cluster.representativeTitle,
          oneLine: descriptions[0] ?? cluster.representativeTitle,
          overview: `${cluster.representativeTitle}와 관련한 결정과 변화가 전날 확인됐습니다. 여러 보도를 함께 보면 발표 자체보다 실제 적용 범위와 다음 단계가 핵심입니다.`,
          keyPoints: [
            descriptions[0] ?? "핵심 결정이 발표됐습니다.",
            descriptions[1] ?? "후속 적용과 검증 과정이 남아 있습니다.",
          ],
          analogy: "새 규칙을 정하는 일은 지도에 길을 긋는 것과 비슷합니다. 선을 그은 뒤 실제로 길이 만들어지는지까지 봐야 합니다.",
          whyItMatters: "정책과 기술의 변화는 당장 눈에 보이지 않아도 생활비, 안전, 선택 가능한 서비스의 범위를 바꿀 수 있습니다.",
          socraticQuestion: "이 변화의 이익과 비용은 누구에게 먼저 돌아가며, 우리는 무엇을 확인한 뒤 평가해야 할까요?",
          factStatus: "reported",
          confidence: cluster.sourceCount >= 2 ? 0.86 : 0.68,
          sourceIds: clusterSources.slice(0, Math.max(1, Math.min(3, clusterSources.length))).map((source) => source.id),
        };
      }),
    };
  }
}

export async function summarizeStory(
  category: NewsCategory,
  candidates: StoryCluster[],
  generator?: StructuredGenerator,
): Promise<DigestItem[]> {
  const limitedCandidates = candidates
    .filter((candidate) => candidate.category === category)
    .slice(0, 6);
  if (limitedCandidates.length === 0) return [];

  const sources = groundedSources(limitedCandidates);
  const activeGenerator =
    generator ??
    (process.env.DEMO_MODE === "true"
      ? new FixtureSummaryGenerator(limitedCandidates, sources)
      : new AiSdkStructuredGenerator());
  const prompt = buildPrompt(category, limitedCandidates, sources);

  try {
    const first = await activeGenerator.generate({
      schema: AiDigestSelectionSchema,
      prompt,
    });
    return validateGrounding(first, category, limitedCandidates, sources);
  } catch (firstError) {
    try {
      const second = await activeGenerator.generate({
        schema: AiDigestSelectionSchema,
        prompt,
        correction: `스키마와 grounding 규칙을 지키세요. 오류: ${firstError instanceof Error ? firstError.message : "invalid response"}`,
      });
      return validateGrounding(second, category, limitedCandidates, sources);
    } catch (secondError) {
      throw new Error(
        `${CATEGORY_LABEL[category]} 요약/grounding 실패: ${secondError instanceof Error ? secondError.message : "invalid response"}`,
        { cause: secondError },
      );
    }
  }
}
