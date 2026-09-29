using System.Numerics.Tensors;

namespace HistogramClassification.Core.Network;

/// <summary>
/// Одношарова ШНМ (рис. 3 статті): y_k = σ(W_k·x + b_k).
/// Навчання — дельта-правило: W_k += η·(t_k − y_k)·y_k·(1 − y_k)·x.
/// Скалярні добутки й оновлення ваг — SIMD через TensorPrimitives.
/// </summary>
public sealed class SingleLayerPerceptron
{
    private const float InitRange = 0.05f;

    public SingleLayerPerceptron(int inputs, int outputs, int seed)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(inputs, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(outputs, 1);
        var random = new Random(seed);
        Weights = new float[outputs][];
        for (var k = 0; k < outputs; k++)
        {
            Weights[k] = new float[inputs];
            for (var i = 0; i < inputs; i++)
                Weights[k][i] = (float)(random.NextDouble() * 2 - 1) * InitRange;
        }
        Biases = new float[outputs];
    }

    public SingleLayerPerceptron(float[][] weights, float[] biases)
    {
        if (weights.Length == 0 || weights.Length != biases.Length)
            throw new ArgumentException("Кількість рядків ваг має збігатися з кількістю зсувів і бути більшою за 0.");
        var inputs = weights[0]?.Length ?? 0;
        if (inputs == 0 || weights.Any(row => row is null || row.Length != inputs))
            throw new ArgumentException("Усі рядки ваг мають однакову ненульову довжину.");
        Weights = weights;
        Biases = biases;
    }

    public float[][] Weights { get; }
    public float[] Biases { get; }
    public int Inputs => Weights[0].Length;
    public int Outputs => Weights.Length;

    public static float Sigmoid(float z) => 1f / (1f + MathF.Exp(-z));

    public float[] Predict(ReadOnlySpan<float> x)
    {
        if (x.Length != Inputs)
            throw new ArgumentException($"Очікувалось {Inputs} входів, отримано {x.Length}.", nameof(x));
        var y = new float[Outputs];
        for (var k = 0; k < Outputs; k++)
            y[k] = Sigmoid(TensorPrimitives.Dot(Weights[k], x) + Biases[k]);
        return y;
    }

    public int Classify(ReadOnlySpan<float> x) => TensorPrimitives.IndexOfMax(Predict(x));

    /// <summary>Один крок дельта-правила для прикладу з one-hot ціллю. Повертає похибку ½Σ(t−y)² до оновлення.</summary>
    public float Train(ReadOnlySpan<float> x, int label, float learningRate)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(label);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(label, Outputs);
        var y = Predict(x);
        var error = 0f;
        for (var k = 0; k < Outputs; k++)
        {
            var e = (k == label ? 1f : 0f) - y[k];
            error += 0.5f * e * e;
            var step = learningRate * e * y[k] * (1f - y[k]);
            TensorPrimitives.MultiplyAdd(x, step, Weights[k], Weights[k]);
            Biases[k] += step;
        }
        return error;
    }
}
