import { createHash } from "node:crypto";
import { APICallError } from "ai";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import {
  AiSdkStructuredGenerator,
  isExternalAiCallError,
} from "@/lib/ai/structured-generator";
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

function truncatedLogText(value: unknown, limit: number) {
  if (value == null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.slice(0, limit);
}

function aiErrorLogDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  const details: Record<string, unknown> = {
    errorName: error.name,
    errorMessage: truncatedLogText(error.message, 300),
  };
  if (APICallError.isInstance(error)) {
    details.statusCode = error.statusCode;
    const responseBody = truncatedLogText(error.responseBody, 500);
    if (responseBody) details.responseBody = responseBody;
  }
  return details;
}

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
    selectPromptArticles(cluster).map((article): GroundedSource => ({
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

function selectPromptArticles(cluster: StoryCluster) {
  const articles = [...cluster.articles].sort((left, right) => left.id.localeCompare(right.id));
  const selected = [];
  const selectedIds = new Set<string>();
  const domains = new Set<string>();

  for (const article of articles) {
    if (domains.has(article.sourceDomain)) continue;
    selected.push(article);
    selectedIds.add(article.id);
    domains.add(article.sourceDomain);
    if (selected.length === 3) return selected;
  }
  for (const article of articles) {
    if (selectedIds.has(article.id)) continue;
    selected.push(article);
    if (selected.length === 3) break;
  }
  return selected;
}

function limitedText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

export function createFallbackDigestItem(
  category: NewsCategory,
  cluster: StoryCluster,
): DigestItem {
  const articles = [...cluster.articles].sort((left, right) => left.id.localeCompare(right.id));
  const descriptions = [...new Set(
    articles.map((article) => article.description.trim()).filter(Boolean),
  )];
  const oneLine = limitedText(descriptions[0] ?? cluster.representativeTitle, 180);
  const overview = limitedText(
    descriptions.slice(0, 2).join(" ") || cluster.representativeTitle,
    1200,
  );
  const factualPoints = [...new Set(
    articles.flatMap((article) => [article.title.trim(), article.description.trim()]).filter(Boolean),
  )].slice(0, 3);
  while (factualPoints.length < 2) factualPoints.push(factualPoints[0] ?? cluster.representativeTitle);

  return DigestItemSchema.parse({
    id: createHash("sha256")
      .update(`${cluster.targetDate}:${cluster.id}`)
      .digest("hex")
      .slice(0, 24),
    clusterId: cluster.id,
    category,
    rank: 1,
    headline: limitedText(cluster.representativeTitle, 120),
    oneLine,
    overview,
    keyPoints: factualPoints.map((point) => limitedText(point, 240)),
    analogy: limitedText(`쉽게 보면 지금 확인된 핵심 변화는 ${oneLine}`, 500),
    whyItMatters: limitedText(
      `${cluster.sourceCount}개 출처의 보도에서 확인된 사건입니다. 실제 영향 범위는 후속 발표와 적용 내용을 통해 확인해야 합니다.`,
      800,
    ),
    socraticQuestion: "이 발표가 실제 변화로 이어졌는지 확인하려면 앞으로 어떤 지표를 봐야 할까요?",
    factStatus: "reported",
    confidence: cluster.sourceCount >= 2 ? 0.65 : 0.5,
    sourceIds: selectPromptArticles(cluster).map((article) => article.id),
  });
}

function buildPrompt(
  category: NewsCategory,
  candidates: StoryCluster[],
  sources: GroundedSource[],
) {
  return `당신은 한 사람을 위한 한국어 뉴스 편집자입니다.
분야: ${CATEGORY_LABEL[category]}

아래 후보 사건에서 정말 중요한 사건만 0~2개 고르세요. 많은 사람의 실제 영향, 실질적 변화, 장기 영향, 여러 출처 확인, 결정과 결과를 우선합니다. 말싸움, 유명인, 논란, 자극적 제목, 루머는 제외합니다.

고등학교 상위권 학생부터 대학 교양 입문자가 쉽게 읽되 내용은 얕지 않은 차분한 한국어로 쓰세요. "중요하다"거나 "경쟁력이 높아진다"는 결론만 쓰지 말고, 입력 출처에 근거가 있을 때 왜 그런지 작동 구조를 1~2단계 설명하세요. 숫자·기간·제도·이해관계자·비용·공급망·기술적 제약·정책 조건이 기사에 있다면 우선 활용하되 없는 정보는 만들지 마세요.

overview는 무슨 일이 있었는지와 그 의미가 생기는 구조를 함께 설명하세요. keyPoints는 overview를 반복하지 말고 결정/사실, 작동 조건, 다음 확인 변수처럼 서로 다른 역할을 갖게 하세요. 필요한 전문용어 1~2개는 처음에 짧게 뜻을 붙일 수 있습니다. analogy는 억지 비유 대신 실제 구조를 쉬운 말로 다시 설명해도 됩니다. whyItMatters는 실제 관련된 개인·기업·정부·시장·과학기술 주체 중 누구의 무엇이 달라질 수 있는지 구체화하세요. socraticQuestion은 감상이 아니라 trade-off, incentive, second-order effect, verification 중 하나 이상을 생각하게 하세요.

사실·주장·전망을 구분하고, 정치적 편향 표현을 피하세요. 과학의 초기 연구·경제 전망·기업 발표는 확정 사실처럼 쓰지 마세요. 같은 분량에서 정보 밀도를 높이고 기존 schema 길이 한도를 지키세요.

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
  const summaryStartedAt = Date.now();
  const sourceDate = limitedCandidates[0]!.targetDate;
  const logStage = (stage: string, details: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ stage, sourceDate, category, elapsedMs: Date.now() - summaryStartedAt, ...details }));
  };
  logStage("category_prompt_prepared", {
    candidateCount: limitedCandidates.length,
    groundedSourceCount: sources.length,
    promptChars: prompt.length,
  });

  try {
    let first: unknown;
    try {
      first = await activeGenerator.generate({
        schema: AiDigestSelectionSchema,
        prompt,
      });
      logStage("category_first_ai_call_completed", { result: "success" });
    } catch (firstCallError) {
      logStage("category_first_ai_call_completed", {
        result: "error",
        ...aiErrorLogDetails(firstCallError),
      });
      throw firstCallError;
    }
    return validateGrounding(first, category, limitedCandidates, sources);
  } catch (firstError) {
    if (isExternalAiCallError(firstError)) throw firstError;
    logStage("category_correction_started");
    try {
      const second = await activeGenerator.generate({
        schema: AiDigestSelectionSchema,
        prompt,
        correction: `스키마와 grounding 규칙을 지키세요. 오류: ${firstError instanceof Error ? firstError.message : "invalid response"}`,
      });
      const corrected = validateGrounding(second, category, limitedCandidates, sources);
      logStage("category_correction_completed", { result: "success" });
      return corrected;
    } catch (secondError) {
      logStage("category_correction_completed", {
        result: "error",
        ...aiErrorLogDetails(secondError),
      });
      throw new Error(
        `${CATEGORY_LABEL[category]} 요약/grounding 실패: ${secondError instanceof Error ? secondError.message : "invalid response"}`,
        { cause: secondError },
      );
    }
  }
}
