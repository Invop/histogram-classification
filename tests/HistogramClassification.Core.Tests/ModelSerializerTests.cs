using HistogramClassification.Core.Features;
using HistogramClassification.Core.Network;

namespace HistogramClassification.Core.Tests;

public class ModelSerializerTests
{
    private static readonly ModelMetadata Metadata =
        new(["hq-4k"], 90, 10, 200, 0.1f, 42, 0.95, 0.9, new DateTimeOffset(2026, 9, 29, 12, 0, 0, TimeSpan.Zero));

    [Fact]
    public void Round_trip_preserves_classes_weights_and_metadata()
    {
        var network = new SingleLayerPerceptron(PartialHistogram.FeatureLength, 3, seed: 2);
        network.Biases[1] = 0.25f;
        var model = new TrainedModel(["desert", "grass", "ocean"], network, Metadata);

        var restored = ModelSerializer.Deserialize(ModelSerializer.Serialize(model));

        Assert.Equal(model.ClassNames, restored.ClassNames);
        Assert.Equal(model.Network.Weights, restored.Network.Weights);
        Assert.Equal(model.Network.Biases, restored.Network.Biases);
        Assert.Equal(Metadata.Groups, restored.Metadata.Groups);
        Assert.Equal(Metadata with { Groups = restored.Metadata.Groups }, restored.Metadata);
    }

    [Fact]
    public void Rejects_invalid_json() =>
        Assert.Throws<InvalidDataException>(() => ModelSerializer.Deserialize("{oops"));

    [Fact]
    public void Rejects_model_with_other_input_size()
    {
        var json = ModelSerializer.Serialize(new TrainedModel(["a", "b"], new SingleLayerPerceptron(10, 2, 1), Metadata));

        Assert.Throws<InvalidDataException>(() => ModelSerializer.Deserialize(json));
    }
}
