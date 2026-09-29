using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace HistogramClassification.Core.Tests;

internal sealed class TempDir : IDisposable
{
    public string Root { get; } = Directory.CreateTempSubdirectory("hc-tests-").FullName;

    public string Combine(params string[] parts) => Path.Combine([Root, .. parts]);

    public string CreateDir(params string[] parts) => Directory.CreateDirectory(Combine(parts)).FullName;

    public void Dispose()
    {
        try { Directory.Delete(Root, recursive: true); }
        catch (IOException) { }
    }
}

internal static class TestImages
{
    public static string SaveSolid(string path, int width, int height, Rgb24 color)
    {
        using var image = new Image<Rgb24>(width, height, color);
        image.Save(path);
        return path;
    }

    /// <summary>Сіре зображення з випадковою яркістю в [min; max].</summary>
    public static string SaveNoise(string path, int width, int height, int min, int max, int seed)
    {
        var random = new Random(seed);
        using var image = new Image<Rgb24>(width, height);
        for (var y = 0; y < height; y++)
        for (var x = 0; x < width; x++)
        {
            var v = (byte)random.Next(min, max + 1);
            image[x, y] = new Rgb24(v, v, v);
        }
        image.Save(path);
        return path;
    }

    public static string SaveBroken(string path)
    {
        File.WriteAllText(path, "not an image");
        return path;
    }
}
