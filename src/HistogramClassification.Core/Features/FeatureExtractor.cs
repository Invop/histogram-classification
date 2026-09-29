using System.Collections.Concurrent;
using HistogramClassification.Core.Imaging;
using HistogramClassification.Core.Progress;
using SixLabors.ImageSharp;

namespace HistogramClassification.Core.Features;

/// <summary>Зображення → неповна гістограма → 1024 бінарні ознаки.</summary>
public static class FeatureExtractor
{
    public const string Stage = "features";

    public static async Task<ExtractionResult> ExtractAsync(
        IReadOnlyList<LabeledImage> images, bool parallel, IProgress<ProgressInfo>? progress, CancellationToken ct)
    {
        var samples = new Sample?[images.Count];
        var skipped = new ConcurrentBag<string>();

        await BatchRunner.RunAsync(images.Count, parallel, Stage, i =>
        {
            var image = images[i];
            if (TryLoadHistogram(image.Path, out var histogram))
                samples[i] = new Sample(image.Path, PartialHistogram.FromHistogram(histogram), image.Label);
            else
                skipped.Add(image.Path);
        }, progress, ct);

        return new ExtractionResult([.. samples.OfType<Sample>()], [.. skipped.Order(StringComparer.Ordinal)]);
    }

    private static bool TryLoadHistogram(string path, out int[] histogram)
    {
        try
        {
            histogram = LumaHistogram.Compute(path);
            return true;
        }
        catch (Exception e) when (e is ImageFormatException or IOException or NotSupportedException)
        {
            histogram = [];
            return false;
        }
    }
}
