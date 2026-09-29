using HistogramClassification.Core.Network;

namespace HistogramClassification.Core.Tests;

public class SingleLayerPerceptronTests
{
    private static readonly float[] A = [1, 1, 1, 1, 0, 0, 0, 0];
    private static readonly float[] B = [0, 0, 0, 0, 1, 1, 1, 1];

    [Fact]
    public void Sigmoid_of_zero_is_half() => Assert.Equal(0.5f, SingleLayerPerceptron.Sigmoid(0f));

    [Fact]
    public void Predict_returns_one_value_in_0_1_per_output()
    {
        var y = new SingleLayerPerceptron(8, 3, seed: 1).Predict(A);

        Assert.Equal(3, y.Length);
        Assert.All(y, v => Assert.InRange(v, 0f, 1f));
    }

    [Fact]
    public void Same_seed_gives_same_initial_weights() =>
        Assert.Equal(new SingleLayerPerceptron(8, 2, 7).Weights, new SingleLayerPerceptron(8, 2, 7).Weights);

    [Fact]
    public void Predict_rejects_wrong_input_length() =>
        Assert.Throws<ArgumentException>(() => new SingleLayerPerceptron(8, 2, 1).Predict(new float[7]));

    [Fact]
    public void Train_learns_linearly_separable_classes()
    {
        var net = new SingleLayerPerceptron(8, 2, seed: 3);
        var firstError = net.Train(A, 0, 0.5f);
        for (var i = 0; i < 200; i++)
        {
            net.Train(A, 0, 0.5f);
            net.Train(B, 1, 0.5f);
        }

        Assert.Equal(0, net.Classify(A));
        Assert.Equal(1, net.Classify(B));
        Assert.True(net.Predict(A)[0] > 0.8f);
        Assert.True(net.Train(A, 0, 0.5f) < firstError);
    }

    [Fact]
    public void Constructor_from_weights_validates_shape() =>
        Assert.Throws<ArgumentException>(() => new SingleLayerPerceptron([new float[4], new float[3]], new float[2]));
}
