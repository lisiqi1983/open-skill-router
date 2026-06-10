import { promises as fs } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import {
  checkStaticSourceHealth,
  defaultProjectIndexPath,
  defaultSourceRegistryPath,
  readLocalSkillIndex,
  readStaticSkillIndex,
  recommendSkills,
  resolveSourceRegistryEntry,
  resolveSourceUrls,
  type LocalSkillIndex,
  type ModelRerankOutput,
  type RecommendationMode,
  type RecommendationScoringConfig,
  type RecommendSkillsResult,
  type TaskProfile,
} from "@openskillrouter/core";

export interface SkillRouterApiOptions {
  indexPath?: string;
  defaultSource?: string;
  sourceRegistry?: string;
  feedbackDir?: string;
  defaultScoring?: RecommendationScoringConfig;
  allowDirectSources?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface RecommendApiRequest {
  task: string;
  source?: string;
  max_results?: number;
  recommendation_mode?: RecommendationMode;
  privacy_mode?: TaskProfile["privacyMode"];
  include_candidate_pack?: boolean;
  model_rerank?: ModelRerankOutput;
  scoring?: RecommendationScoringConfig;
}

export interface FeedbackApiRequest {
  skill_id: string;
  recommendation_id?: string;
  accepted?: boolean;
  task_completed?: boolean;
  rating?: number;
  comment?: string;
  anonymous_tags?: Record<string, unknown>;
}

export function createSkillRouterApiServer(
  options: SkillRouterApiOptions = {},
) {
  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, options);
    } catch (error) {
      sendJson(response, statusForError(error), {
        error: {
          message: errorMessage(error),
        },
      });
    }
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: SkillRouterApiOptions,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      schemaVersion: "skillrouter.api-health/v1",
      status: "ok",
      service: "open-skill-router-api",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/sources/health") {
    const source = url.searchParams.get("source") ?? options.defaultSource;
    if (!source) {
      throw badRequest("Missing source query parameter.");
    }
    const sources = await resolveApiSourceUrls(source, options, {
      allowDirect: source === options.defaultSource,
    });
    sendJson(
      response,
      200,
      await checkStaticSourceHealth(source, sources, {
        fetchImpl: options.fetchImpl,
        now: options.now?.(),
      }),
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/recommend") {
    const body = await readJsonBody<RecommendApiRequest>(request);
    sendJson(response, 200, await recommendViaApi(body, options));
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/feedback") {
    const body = await readJsonBody<FeedbackApiRequest>(request);
    sendJson(response, 200, await recordFeedback(body, options));
    return;
  }

  sendJson(response, 404, {
    error: {
      message: `Route not found: ${request.method ?? "GET"} ${url.pathname}`,
    },
  });
}

async function recommendViaApi(
  input: RecommendApiRequest,
  options: SkillRouterApiOptions,
): Promise<RecommendSkillsResult> {
  if (!input || typeof input.task !== "string" || input.task.trim() === "") {
    throw badRequest("Request body must include a non-empty task.");
  }
  if (input.recommendation_mode === "strict_local") {
    throw badRequest(
      "strict_local recommendations must run in the local client.",
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, "index_path")) {
    throw badRequest(
      "index_path cannot be set by API clients; configure the API server index instead.",
    );
  }

  const mode =
    input.include_candidate_pack && !input.recommendation_mode
      ? "full_skill_rerank"
      : (input.recommendation_mode ?? "fast_metadata");
  const index = await readApiIndex(input, options);

  return recommendSkills({
    index,
    task: input.task,
    maxResults: input.max_results,
    mode,
    privacyMode: input.privacy_mode,
    modelRerank: input.model_rerank,
    scoring: input.scoring ?? options.defaultScoring,
  });
}

async function readApiIndex(
  input: RecommendApiRequest,
  options: SkillRouterApiOptions,
): Promise<LocalSkillIndex> {
  if (input.source) {
    return readStaticSkillIndex(
      await resolveApiSourceUrls(input.source, options, {
        allowDirect: options.allowDirectSources ?? false,
      }),
      {
        fetchImpl: options.fetchImpl,
      },
    );
  }

  if (options.defaultSource) {
    return readStaticSkillIndex(
      await resolveApiSourceUrls(options.defaultSource, options, {
        allowDirect: true,
      }),
      {
        fetchImpl: options.fetchImpl,
      },
    );
  }

  return readLocalSkillIndex(options.indexPath ?? defaultProjectIndexPath());
}

async function resolveApiSourceUrls(
  source: string,
  options: SkillRouterApiOptions,
  behavior: { allowDirect: boolean },
): Promise<string[]> {
  const registryPath = options.sourceRegistry ?? defaultSourceRegistryPath();
  const entry = await resolveSourceRegistryEntry(source, registryPath);
  if (entry) {
    return resolveSourceUrls(source, registryPath);
  }
  if (behavior.allowDirect || options.allowDirectSources) return [source];
  throw badRequest(
    `Unknown API source "${source}". Configure it in the server source registry or enable direct sources.`,
  );
}

async function recordFeedback(
  input: FeedbackApiRequest,
  options: SkillRouterApiOptions,
): Promise<Record<string, unknown>> {
  if (
    !input ||
    typeof input.skill_id !== "string" ||
    input.skill_id.trim() === ""
  ) {
    throw badRequest("Request body must include a non-empty skill_id.");
  }
  if (
    input.rating !== undefined &&
    (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
  ) {
    throw badRequest("rating must be an integer from 1 to 5.");
  }

  const feedbackDir =
    options.feedbackDir ??
    path.join(process.cwd(), ".skillrouter", "api-feedback");
  const feedbackPath = path.join(feedbackDir, "feedback.jsonl");
  const record = {
    schemaVersion: "skillrouter.api-feedback/v1",
    recordedAt: (options.now?.() ?? new Date()).toISOString(),
    skillId: input.skill_id,
    recommendationId: input.recommendation_id,
    accepted: input.accepted,
    taskCompleted: input.task_completed,
    rating: input.rating,
    comment: input.comment,
    anonymousTags: input.anonymous_tags,
  };

  await fs.mkdir(feedbackDir, { recursive: true });
  await fs.appendFile(feedbackPath, `${JSON.stringify(record)}\n`, "utf8");

  return {
    recorded: true,
    feedbackPath,
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function badRequest(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

function statusForError(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
