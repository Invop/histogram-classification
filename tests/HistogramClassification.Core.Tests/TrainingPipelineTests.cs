using System.Collections.Concurrent;
using HistogramClassification.Core.Dataset;
using HistogramClassification.Core.Features;
using HistogramClassification.Core.Network;
using HistogramClassification.Core.Progress;
using HistogramClassification.Core.Training;

namespace HistogramClassification.Core.Tests;

public class TrainingPipelineTests
{
    private sealed class RecordingObserver : IPipelineObserver
    {
        public ConcurrentBag<ProgressInfo> Progress { get; } = new();
        public List<EpochMetrics> Epochs { get; } = new();
        public ConcurrentQueue<string> Messages { get; } = new();
        public void OnProgress(ProgressInfo progress) => Progress.Add(progress);
        public void OnEpoch(EpochMetrics metrics) => Epochs.Add(metrics);
        public void OnInfo(string message) => Messages.Enqueue(message);
        public void OnWarning(string message) => Messages.Enqueue("WARN " + message);
    }

    [Fact]
    public async Task Trains_dark_vs_bright_and_recognizes_new_image()
    {
        using var dir = new TempDir();
        var dark = dir.CreateDir("hq", "dark");
        var bright = dir.CreateDir("hq", "bright");
        for (var i = 0; i < 10; i++)
        {
            TestImages.SaveNoise(Path.Combine(dark, $"d{i}.png"), 16, 16, 0, 60, i);
            TestImages.SaveNoise(Path.Combine(bright, $"b{i}.png"), 16, 16, 190, 255, 100 + i);
        }
        TestImages.SaveBroken(Path.Combine(dark, "broken.jpg"));
        var request = new TrainingRequest(["hq"], 0, 50, 0.5f, 0.2, 1, true);
        var split = new AssetsCatalog(dir.Root).BuildSplit(request.Groups, request.PerClassLimit, request.TestFraction, request.Seed);
        var observer = new RecordingObserver();

        var outcome = await TrainingPipeline.RunAsync(split, request, observer, CancellationToken.None);

        Assert.Equal(new[] { "bright", "dark" }, outcome.Model.ClassNames);
        Assert.Equal(50, observer.Epochs.Count);
        Assert.Equal(1.0, outcome.History[^1].TrainAccuracy);
        Assert.Equal(1.0, outcome.History[^1].TestAccuracy);
        Assert.Single(outcome.SkippedFiles);
        Assert.Equal(new[] { "features", "training" }, outcome.Timings.Select(t => t.Stage));
        Assert.Contains(observer.Messages, m => m.StartsWith("WARN"));
        Assert.Contains(observer.Progress, p => p.Stage == FeatureExtractor.Stage && p.Done == p.Total);

        using var probe = File.OpenRead(TestImages.SaveNoise(dir.Combine("probe.png"), 16, 16, 10, 50, 999));
        var result = Recognizer.Recognize(outcome.Model, probe);
        Assert.Equal("dark", result.Predicted);
        Assert.Equal(2, result.Outputs.Count);
        Assert.Equal(256, result.Partial.Length);
    }
}
