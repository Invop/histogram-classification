using HistogramClassification.Core.Features;

namespace HistogramClassification.Core.Tests;

public class PartialHistogramTests
{
    [Fact]
    public void Quantize_scales_to_0_15_relative_to_max()
    {
        var histogram = new int[256];
        histogram[1] = 50;
        histogram[2] = 100;
        histogram[3] = 25;
        histogram[4] = 1;

        var q = PartialHistogram.Quantize(histogram);

        Assert.Equal(0, q[0]);
        Assert.Equal(8, q[1]);
        Assert.Equal(15, q[2]);
        Assert.Equal(4, q[3]);
        Assert.Equal(0, q[4]);
    }

    [Fact]
    public void Quantize_of_empty_histogram_is_all_zeros() =>
        Assert.All(PartialHistogram.Quantize(new int[256]), v => Assert.Equal(0, v));

    [Fact]
    public void Encode_writes_4_bits_msb_first()
    {
        var q = new int[256];
        q[0] = 15;
        q[1] = 8;
        q[2] = 5;

        var x = PartialHistogram.Encode(q);

        Assert.Equal(1024, x.Length);
        Assert.Equal(new float[] { 1, 1, 1, 1 }, x[0..4]);
        Assert.Equal(new float[] { 1, 0, 0, 0 }, x[4..8]);
        Assert.Equal(new float[] { 0, 1, 0, 1 }, x[8..12]);
        Assert.All(x[12..], v => Assert.Equal(0f, v));
    }

    [Fact]
    public void FromHistogram_has_feature_length() =>
        Assert.Equal(PartialHistogram.FeatureLength, PartialHistogram.FromHistogram(new int[256]).Length);
}
