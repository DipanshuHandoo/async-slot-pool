export interface ProgressStats {
  done: number;
  total: number | null;
  succeeded: number;
  failed: number;
  pending: number | null;
}

export interface TaskError<T> {
  item: T;
  index: number;
  error: string;
  attempt: number;
  willRetry: boolean;
}

export interface AsyncSlotPoolOptions<T> {
  concurrency?: number;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryJitter?: number;
  bail?: boolean;
  onProgress?: ((stats: ProgressStats) => void) | null;
  onTaskError?: ((info: TaskError<T>) => void) | null;
}

export interface TaskSuccess<T, R> {
  index: number;
  item: T;
  result: R;
}

export interface TaskFailure<T> {
  index: number;
  item: T;
  error: string;
  attempts: number;
}

export interface PoolStats {
  total: number;
  succeeded: number;
  failed: number;
  aborted: boolean;
  durationMs: number;
}

export interface AsyncSlotPoolResult<T, R> {
  succeeded: Array<TaskSuccess<T, R>>;
  failed: Array<TaskFailure<T>>;
  stats: PoolStats;
}

export declare function asyncSlotPool<T, R>(
  items: Iterable<T>,
  handler: (item: T, index: number) => R | PromiseLike<R>,
  options?: AsyncSlotPoolOptions<T>,
): Promise<AsyncSlotPoolResult<T, Awaited<R>>>;

export { asyncSlotPool as workerPool };
export type WorkerPoolOptions<T> = AsyncSlotPoolOptions<T>;
export type WorkerPoolResult<T, R> = AsyncSlotPoolResult<T, R>;