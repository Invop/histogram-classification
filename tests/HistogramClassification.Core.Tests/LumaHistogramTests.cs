using HistogramClassification.Core.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace HistogramClassification.Core.Tests;

public class LumaHistogramTests
{
    [Theory]
    [InlineData(255, 0, 0, 76)]
    [InlineData(0, 255, 0, 150)]
    [InlineData(0, 0, 255, 29)]
    [InlineData(255, 255, 255, 255)]
    [InlineData(0, 0, 0, 0)]
    [InlineData(100, 150, 200, 141)]
    public void Luma_follows_YUV_formula(byte r, byte g, byte b, byte expected) =>
        Assert.Equal(expected, LumaHistogram.Luma(r, g, b));

    [Fact]
    public void Compute_counts_pixels_per_brightness()
    {
        using var image = new Image<Rgb24>(4, 2, new Rgb24(0, 0, 0));
        image[0, 0] = new Rgb24(255, 255, 255);
        image[3, 1] = new Rgb24(255, 255, 255);
        image[1, 1] = new Rgb24(255, 0, 0);

        var histogram = LumaHistogram.Compute(image);

        Assert.Equal(256, histogram.Length);
        Assert.Equal(5, histogram[0]);
        Assert.Equal(2, histogram[255]);
        Assert.Equal(1, histogram[76]);
        Assert.Equal(8, histogram.Sum());
    }

    [Fact]
    public void Compute_from_file_matches_in_memory()
    {
        using var dir = new TempDir();
        var path = TestImages.SaveNoise(dir.Combine("noise.png"), 10, 10, 0, 255, seed: 1);
        using var image = Image.Load<Rgb24>(path);

        Assert.Equal(LumaHistogram.Compute(image), LumaHistogram.Compute(path));
    }
}
