using HistogramClassification.Core.Imaging;

namespace HistogramClassification.Core.Features;

/// <summary>
/// «Неповна» гістограма: значення нормуються до [0; Levels-1] відносно максимуму
/// і кодуються BitsPerBin бітами — 256 · 4 = 1024 бінарні входи ШНМ.
/// </summary>
public static class PartialHistogram
{
    public const int Levels = 16;
    public const int BitsPerBin = 4;
    public const int FeatureLength = LumaHistogram.Bins * BitsPerBin;

    public static int[] Quantize(IReadOnlyList<int> histogram)
    {
        var quantized = new int[histogram.Count];
        var max = histogram.Count == 0 ? 0 : histogram.Max();
        if (max == 0) return quantized;

        for (var i = 0; i < histogram.Count; i++)
            quantized[i] = (int)Math.Round((Levels - 1) * (double)histogram[i] / max, MidpointRounding.AwayFromZero);
        return quantized;
    }

    public static float[] Encode(IReadOnlyList<int> quantized)
    {
        var features = new float[quantized.Count * BitsPerBin];
        for (var i = 0; i < quantized.Count; i++)
        for (var bit = 0; bit < BitsPerBin; bit++)
            features[i * BitsPerBin + bit] = (quantized[i] >> (BitsPerBin - 1 - bit)) & 1;
        return features;
    }

    public static float[] FromHistogram(IReadOnlyList<int> histogram) => Encode(Quantize(histogram));
}
