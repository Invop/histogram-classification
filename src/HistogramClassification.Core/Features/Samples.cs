namespace HistogramClassification.Core.Features;

public sealed record LabeledImage(string Path, int Label);

public sealed record Sample(string Path, float[] Features, int Label);

public sealed record ExtractionResult(IReadOnlyList<Sample> Samples, IReadOnlyList<string> SkippedFiles);
