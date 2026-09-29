using System.Collections.Concurrent;
using HistogramClassification.Core.Features;
using HistogramClassification.Core.Progress;

namespace HistogramClassification.Core.Tests;

public class FeatureExtractorTests
{
    [Fact]
    public async Task Parallel_and_sequential_give_same_features_and_skip_broken_files()
    {
        using var dir = new TempDir();
        var images = Enumerable.Range(0, 6)
            .Select(i => new LabeledImage(TestImages.SaveNoise(dir.Combine($"img{i}.png"), 20, 20, i * 40, i * 40 + 30, i), i % 2))
            .ToList();
        var broken = TestImages.SaveBroken(dir.Combine("broken.jpg"));
        images.Add(new LabeledImage(broken, 0));
        var progress = new ConcurrentBag<ProgressInfo>();

        var parallel = await FeatureExtractor.ExtractAsync(images, parallel: true, new ActionProgress<ProgressInfo>(progress.Add), CancellationToken.None);
        var sequential = await FeatureExtractor.ExtractAsync(images, parallel: false, null, CancellationToken.None);

        Assert.Equal(6, parallel.Samples.Count);
        Assert.All(parallel.Samples, s => Assert.Equal(1024, s.Features.Length));
        Assert.Equal(images.Take(6).Select(i => i.Label), parallel.Samples.Select(s => s.Label));
        Assert.Equal(parallel.Samples.Select(s => s.Path), sequential.Samples.Select(s => s.Path));
        Assert.Equal(parallel.Samples.Select(s => s.Features), sequential.Samples.Select(s => s.Features));
        Assert.Equal(new[] { broken }, parallel.SkippedFiles);
        Assert.Equal(7, progress.Count);
        Assert.Equal(7, progress.Max(p => p.Done));
        Assert.All(progress, p => Assert.Equal(FeatureExtractor.Stage, p.Stage));
    }

    [Fact]
    public async Task Honors_cancellation()
    {
        using var dir = new TempDir();
        var images = new[] { new LabeledImage(TestImages.SaveNoise(dir.Combine("a.png"), 8, 8, 0, 255, 1), 0) };
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => FeatureExtractor.ExtractAsync(images, true, null, cts.Token));
    }
}
