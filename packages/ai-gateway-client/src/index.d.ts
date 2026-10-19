// Types for @ads/ai-gateway-client (ADS AI Gateway contract v1).
export type Status = 'GROUNDED' | 'INSUFFICIENT_EVIDENCE';
export interface Citation { ref: string; resourceId: string; paragraphRef: string; title: string; sourceUri: string | null; score: number | null; sourceVersion: string | null }
export interface AskInput { useCase: string; collection: string; query: string; language?: string; audience?: string; context?: Record<string, string | number | boolean | string[]>; consentRef?: string | null; answerSchemaId?: string | null }
export interface AskResult { requestId: string; runId: string; useCase: string; status: Status; answer: string | null; answerJson: unknown; citations: Citation[]; evidence: { citationCount: number; topScore: number | null; policy: 'kb' | 'registry'; compositeRetry: boolean }; testMode: boolean; provider: { name: 'progress-agentic-rag'; mode: 'live' | 'mock'; collection: string }; timing: { totalMs: number; upstreamMs: number; retries: number; coalesced: boolean } }
export type StreamEvent = { type: 'answer-chunk'; text: string } | { type: 'citations'; citations: Array<Pick<Citation, 'ref' | 'resourceId' | 'title' | 'sourceUri' | 'score'>> } | { type: 'status'; status: Status } | { type: 'error'; code: string; retryable: boolean } | { type: 'done'; runId: string };
export interface CallOptions { subjectToken?: string; requestId?: string; idempotencyKey?: string; timeoutMs?: number }
export class AiGatewayError extends Error { status: number; code: string; retryable: boolean; retryAfterSec: number | null; requestId: string | null }
export interface AiGatewayClient {
  ask(input: AskInput, opts?: CallOptions): Promise<AskResult>;
  askStream(input: AskInput, opts?: CallOptions): AsyncGenerator<StreamEvent>;
  find(input: { useCase: string; collection: string; query: string; labels?: string[]; contentTypes?: string[]; pageSize?: number }, opts?: CallOptions): Promise<any>;
  graph(input: { useCase: string; collection: string; entity?: { value: string; group: string } | null; undirected?: boolean; topK?: number }, opts?: CallOptions): Promise<any>;
  resource(resourceRef: string, where: { useCase: string; collection?: string }, opts?: CallOptions): Promise<any>;
  collections(useCase: string, opts?: CallOptions): Promise<any>;
  ingest(input: { useCase: string; collection: string; sourceId: string; sourceVersion: string; title: string; contentType: 'text/markdown' | 'text/plain' | 'application/pdf'; content?: string; fileRef?: string; labels?: string[]; approvedBy: string; approvedAt: string }, opts?: CallOptions): Promise<{ requestId: string; jobId: string; state: 'PROCESSING' }>;
  ingestStatus(jobId: string, opts?: CallOptions): Promise<any>;
  withdraw(input: { useCase: string; collection: string; sourceId: string }, opts?: CallOptions): Promise<any>;
  health(): Promise<any>;
}
export function createAiGatewayClient(options: { apiBase: string; serviceToken: string; fetchImpl?: typeof fetch; timeoutMs?: number }): AiGatewayClient;
export function collectStream(events: AsyncIterable<StreamEvent>, onChunk?: (text: string) => void): Promise<{ status: Status | 'ERROR'; answer: string | null; citations: StreamEvent[]; error: { code: string; retryable: boolean } | null; runId: string | null; discardShownText: boolean }>;
export function withOneRetry<T>(fn: () => Promise<T>, options?: { maxWaitSec?: number; sleep?: (ms: number) => Promise<void> }): Promise<T>;
export function userMessage(resultOrError: unknown, lang?: 'en' | 'fr'): { kind: 'grounded' | 'insufficient' | 'denied' | 'rate_limited' | 'unavailable'; text: string; retryAfterSec?: number | null; testModeLabel?: string | null };
export const MESSAGES: Record<'en' | 'fr', Record<string, string>>;
