using HistogramClassification.Core.Features;
using HistogramClassification.Core.Network;
using HistogramClassification.Core.Progress;

namespace HistogramClassification.Core.Tests;

public class TrainerTests
{
    private static Sample S(int label, params int[] onBits)
    {
        var x = new float[8];
        foreach (var i in onBits) x[i] = 1;
        return new Sample($"s{label}-{string.Join("", onBits)}", x, label);
    }

    private static readonly Sample[] TrainSet = [S(0, 0, 1, 2), S(0, 0, 1, 3), S(0, 1, 2, 3), S(1, 4, 5, 6), S(1, 4, 5, 7), S(1, 5, 6, 7)];
    private static readonly Sample[] TestSet = [S(0, 0, 2, 3), S(1, 4, 6, 7)];

    [Fact]
    public void Reports_every_epoch_and_reaches_full_accuracy()
    {
        var net = new SingleLayerPerceptron(8, 2, 1);
        var epochs = new List<EpochMetrics>();

        var history = Trainer.Train(net, TrainSet, TestSet, new TrainingOptions(100, 0.5f, 1),
            new ActionProgress<EpochMetrics>(epochs.Add), null, CancellationToken.None);

        Assert.Equal(100, history.Count);
        Assert.Equal(history, epochs);
        Assert.Equal(100, history[^1].Epoch);
        Assert.Equal(1.0, history[^1].TrainAccuracy);
        Assert.Equal(1.0, history[^1].TestAccuracy);
        Assert.True(history[^1].Loss < history[0].Loss);
    }

    [Fact]
    public void Reports_sample_progress_within_each_epoch()
    {
        var reports = new List<ProgressInfo>();

        Trainer.Train(new SingleLayerPerceptron(8, 2, 1), TrainSet, [], new TrainingOptions(2, 0.1f, 1),
            null, new ActionProgress<ProgressInfo>(reports.Add), CancellationToken.None);

        Assert.Equal(12, reports.Count);
        Assert.Equal(new ProgressInfo(Trainer.Stage, 6, 6), reports[5]);
    }

    [Fact]
    public void Is_deterministic_for_same_seed()
    {
        var a = new SingleLayerPerceptron(8, 2, 5);
        var b = new SingleLayerPerceptron(8, 2, 5);
        var options = new TrainingOptions(20, 0.3f, 9);

        Trainer.Train(a, TrainSet, TestSet, options, null, null, CancellationToken.None);
        Trainer.Train(b, TrainSet, TestSet, options, null, null, CancellationToken.None);

        Assert.Equal(a.Weights, b.Weights);
    }

    [Fact]
    public void Test_accuracy_is_null_without_test_set()
    {
        var history = Trainer.Train(new SingleLayerPerceptron(8, 2, 1), TrainSet, [], new TrainingOptions(1, 0.1f, 1),
            null, null, CancellationToken.None);

        Assert.Null(history[^1].TestAccuracy);
    }

    [Fact]
    public void Honors_cancellation()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        Assert.Throws<OperationCanceledException>(() => Trainer.Train(new SingleLayerPerceptron(8, 2, 1), TrainSet, TestSet,
            new TrainingOptions(10, 0.1f, 1), null, null, cts.Token));
    }

    [Theory]
    [InlineData(0, 0.1f)]
    [InlineData(5, 0f)]
    [InlineData(5, -1f)]
    public void Rejects_invalid_options(int epochs, float learningRate) =>
        Assert.ThrowsAny<ArgumentException>(() => Trainer.Train(new SingleLayerPerceptron(8, 2, 1), TrainSet, TestSet,
            new TrainingOptions(epochs, learningRate, 1), null, null, CancellationToken.None));
}
