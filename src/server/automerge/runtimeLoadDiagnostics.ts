export function getRuntimeMemory(): Record<string, number> {
  const memory = process.memoryUsage();
  const mib = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  return {
    rssMiB: mib(memory.rss),
    heapUsedMiB: mib(memory.heapUsed),
    heapTotalMiB: mib(memory.heapTotal),
    externalMiB: mib(memory.external),
    arrayBuffersMiB: mib(memory.arrayBuffers),
  };
}
