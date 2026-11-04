export type QueuedTask<T> = () => T | Promise<T>;

export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private size = 0;

  push<T>(task: QueuedTask<T>): Promise<T> {
    this.size += 1;
    const run = this.tail.then(task, task);
    this.tail = run.then(
      () => {
        this.size -= 1;
      },
      () => {
        this.size -= 1;
      }
    );
    return run;
  }

  get pending(): number {
    return this.size;
  }
}
