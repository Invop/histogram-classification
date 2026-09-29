namespace HistogramClassification.Core.Progress;

/// <summary>
/// Обробляє незалежні елементи 0..count-1. Паралельний режим — Parallel.For
/// (CPU-bound робота, по одному зображенню на ітерацію), потоків = кількість ядер.
/// </summary>
public static class BatchRunner
{
    public static Task RunAsync(
        int count, bool parallel, string stage, Action<int> body,
        IProgress<ProgressInfo>? progress, CancellationToken ct) =>
        Task.Run(() =>
        {
            var done = 0;
            void Step(int i)
            {
                body(i);
                progress?.Report(new ProgressInfo(stage, Interlocked.Increment(ref done), count));
            }

            if (parallel)
            {
                var options = new ParallelOptions { CancellationToken = ct, MaxDegreeOfParallelism = Environment.ProcessorCount };
                Parallel.For(0, count, options, Step);
            }
            else
            {
                for (var i = 0; i < count; i++)
                {
                    ct.ThrowIfCancellationRequested();
                    Step(i);
                }
            }
        }, ct);
}
