namespace HistogramClassification.Core.Network;

public sealed record ModelMetadata(
    IReadOnlyList<string> Groups,
    int TrainCount,
    int TestCount,
    int Epochs,
    float LearningRate,
    int Seed,
    double TrainAccuracy,
    double? TestAccuracy,
    DateTimeOffset TrainedAt);

public sealed record TrainedModel(IReadOnlyList<string> ClassNames, SingleLayerPerceptron Network, ModelMetadata Metadata);
