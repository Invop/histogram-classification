using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace HistogramClassification.Core.Imaging;

/// <summary>Гістограма яркості зображення (256 бінів).</summary>
public static class LumaHistogram
{
    public const int Bins = 256;

    /// <summary>Y' = 0.299·R + 0.587·G + 0.114·B — формула (1) статті.</summary>
    public static byte Luma(byte r, byte g, byte b) =>
        (byte)Math.Clamp(Math.Round(0.299 * r + 0.587 * g + 0.114 * b, MidpointRounding.AwayFromZero), 0, 255);

    public static int[] Compute(Image<Rgb24> image)
    {
        var histogram = new int[Bins];
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                foreach (ref readonly var pixel in accessor.GetRowSpan(y))
                    histogram[Luma(pixel.R, pixel.G, pixel.B)]++;
            }
        });
        return histogram;
    }

    public static int[] Compute(string path)
    {
        using var image = Image.Load<Rgb24>(path);
        return Compute(image);
    }

    public static int[] Compute(Stream stream)
    {
        using var image = Image.Load<Rgb24>(stream);
        return Compute(image);
    }
}
