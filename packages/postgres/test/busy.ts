export function syncWork(durationMs: number) {
  const start = Date.now();
  let result = 0,
    i = 0;
  while (Date.now() - start < durationMs) {
    result += Math.sqrt(i) * Math.log(i + 1);
    i++;
  }
}

export function asyncWork(durationMs: number) {
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      syncWork(100);
      resolve();
    }, durationMs),
  );
}

export async function simulateLoad(syncDurationMs: number, asyncDurationMs: number, asyncCount: number) {
  syncWork(syncDurationMs);

  const asyncTasks = [];
  for (let i = 0; i < asyncCount; i++) {
    asyncTasks.push(asyncWork(asyncDurationMs));
  }

  await Promise.all(asyncTasks);
}
