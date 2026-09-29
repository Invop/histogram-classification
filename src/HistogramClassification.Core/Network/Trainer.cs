using HistogramClassification.Core.Features;
using HistogramClassification.Core.Progress;

namespace HistogramClassification.Core.Network;

public sealed record TrainingOptions(int Epochs, float LearningRate, int Seed);

public sealed record EpochMetrics(int Epoch, int TotalEpochs, double Loss, double TrainAccuracy, double? TestAccuracy);

/// <summary>
/// Онлайн-навчання дельта-правилом: приклади подаються по одному в перемішаному порядку.
/// Навчання послідовне — кожен крок залежить від ваг після попереднього;
/// прискорення дає SIMD усередині SingleLayerPerceptron.
/// </summary>
public static class Trainer
{
    public const string Stage = "epoch";

    public static IReadOnlyList<EpochMetrics> Train(
        SingleLayerPerceptron network, IReadOnlyList<Sample> train, IReadOnlyList<Sample> test, TrainingOptions options,
        IProgress<EpochMetrics>? epochProgress, IProgress<ProgressInfo>? sampleProgress, CancellationToken ct)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(options.Epochs, 1, nameof(options.Epochs));
        if (!(options.LearningRate > 0))
            throw new ArgumentOutOfRangeException(nameof(options), "Швидкість навчання має бути більшою за 0.");
        if (train.Count == 0) throw new ArgumentException("Навчальна вибірка порожня.", nameof(train));

        var random = new Random(options.Seed);
        var order = Enumerable.Range(0, train.Count).ToArray();
        var history = new List<EpochMetrics>(options.Epochs);
        for (var epoch = 1; epoch <= options.Epochs; epoch++)
        {
            random.Shuffle(order);
            var loss = 0.0;
            for (var j = 0; j < order.Length; j++)
            {
                ct.ThrowIfCancellationRequested();
                var sample = train[order[j]];
                loss += network.Train(sample.Features, sample.Label, options.LearningRate);
                sampleProgress?.Report(new ProgressInfo(Stage, j + 1, order.Length));
            }

            var metrics = new EpochMetrics(epoch, options.Epochs, loss / train.Count,
                Accuracy(network, train), test.Count == 0 ? null : Accuracy(network, test));
            history.Add(metrics);
            epochProgress?.Report(metrics);
        }
        return history;
    }

    public static double Accuracy(SingleLayerPerceptron network, IReadOnlyList<Sample> samples) =>
        samples.Count == 0 ? 0 : (double)samples.Count(s => network.Classify(s.Features) == s.Label) / samples.Count;
}
