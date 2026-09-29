using System.Diagnostics;
using System.Globalization;
using HistogramClassification.Core.Dataset;
using HistogramClassification.Core.Features;
using HistogramClassification.Core.Network;
using HistogramClassification.Core.Progress;

namespace HistogramClassification.Core.Training;

public sealed record TrainingRequest(
    IReadOnlyList<string> Groups, int PerClassLimit, int Epochs, float LearningRate, double TestFraction, int Seed, bool Parallel);

public sealed record StageTiming(string Stage, long ElapsedMs);

public sealed record TrainingOutcome(
    TrainedModel Model, IReadOnlyList<EpochMetrics> History, IReadOnlyList<string> SkippedFiles, IReadOnlyList<StageTiming> Timings);

public interface IPipelineObserver
{
    void OnProgress(ProgressInfo progress);
    void OnEpoch(EpochMetrics metrics);
    void OnInfo(string message);
    void OnWarning(string message);
}

/// <summary>Вибірка → ознаки (паралельно) → навчання → модель, з замірами часу кожного етапу.</summary>
public static class TrainingPipeline
{
    public static async Task<TrainingOutcome> RunAsync(
        DatasetSplit split, TrainingRequest request, IPipelineObserver observer, CancellationToken ct)
    {
        var progress = new ActionProgress<ProgressInfo>(observer.OnProgress);
        var timings = new List<StageTiming>();
        observer.OnInfo($"Dataset: groups [{string.Join(", ", split.Groups)}], classes [{string.Join(", ", split.ClassNames)}], " +
                        $"train {split.Train.Count}, test {split.Test.Count}.");

        var stopwatch = Stopwatch.StartNew();
        var extraction = await FeatureExtractor.ExtractAsync([.. split.Train, .. split.Test], request.Parallel, progress, ct);
        timings.Add(new StageTiming("features", stopwatch.ElapsedMilliseconds));
        var mode = request.Parallel ? $"parallel, {Environment.ProcessorCount} threads" : "sequential";
        observer.OnInfo($"Features: {extraction.Samples.Count} images in {stopwatch.ElapsedMilliseconds} ms ({mode}).");
        foreach (var file in extraction.SkippedFiles)
            observer.OnWarning($"Skipped corrupted file: {file}");

        var testPaths = split.Test.Select(i => i.Path).ToHashSet(StringComparer.Ordinal);
        var train = extraction.Samples.Where(s => !testPaths.Contains(s.Path)).ToList();
        var test = extraction.Samples.Where(s => testPaths.Contains(s.Path)).ToList();

        stopwatch.Restart();
        var network = new SingleLayerPerceptron(PartialHistogram.FeatureLength, split.ClassNames.Count, request.Seed);
        var options = new TrainingOptions(request.Epochs, request.LearningRate, request.Seed);
        var history = await Task.Run(() => Trainer.Train(network, train, test, options,
            new ActionProgress<EpochMetrics>(observer.OnEpoch), progress, ct), ct);
        timings.Add(new StageTiming("training", stopwatch.ElapsedMilliseconds));

        var last = history[^1];
        observer.OnInfo(string.Create(CultureInfo.InvariantCulture,
            $"Training: {request.Epochs} epochs in {stopwatch.ElapsedMilliseconds} ms, " +
            $"train accuracy {last.TrainAccuracy:P1}, test {(last.TestAccuracy is { } t ? t.ToString("P1", CultureInfo.InvariantCulture) : "—")}."));

        var metadata = new ModelMetadata(split.Groups, train.Count, test.Count, request.Epochs, request.LearningRate,
            request.Seed, last.TrainAccuracy, last.TestAccuracy, DateTimeOffset.UtcNow);
        return new TrainingOutcome(new TrainedModel(split.ClassNames, network, metadata), history,
            extraction.SkippedFiles, timings);
    }

}
