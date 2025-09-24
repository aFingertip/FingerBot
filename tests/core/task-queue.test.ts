import { TaskQueue } from '../../src/core/task-queue';

describe('TaskQueue', () => {
  afterEach(async () => {
    jest.useRealTimers();
  });

  it('processes tasks sequentially in FIFO order', async () => {
    const queue = new TaskQueue({ retryDelayStrategy: () => 0 });
    const processed: string[] = [];

    queue.registerHandler('send_message', async task => {
      processed.push(task.payload.message);
    });

    await Promise.all([
      queue.enqueue('send_message', {
        target: { userId: 1 },
        message: 'first'
      }),
      queue.enqueue('send_message', {
        target: { userId: 1 },
        message: 'second'
      }),
      queue.enqueue('send_message', {
        target: { userId: 1 },
        message: 'third'
      })
    ]);

    expect(processed).toEqual(['first', 'second', 'third']);

    await queue.shutdown();
  });

  it('retries failed tasks up to maxAttempts', async () => {
    jest.useFakeTimers();

    const queue = new TaskQueue({ retryDelayStrategy: () => 0 });
    let attempts = 0;

    queue.registerHandler('send_message', async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('Simulated failure');
      }
    });

    const enqueuePromise = queue.enqueue('send_message', {
      target: { userId: 1 },
      message: 'retry-test'
    }, { maxAttempts: 3 });

    await jest.runOnlyPendingTimersAsync();
    await enqueuePromise;
    expect(attempts).toBe(3);

    await queue.shutdown();
  });
});
