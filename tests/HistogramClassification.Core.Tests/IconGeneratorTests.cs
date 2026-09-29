using System.Collections.Concurrent;
using HistogramClassification.Core.Dataset;
using HistogramClassification.Core.Progress;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace HistogramClassification.Core.Tests;

public class IconGeneratorTests
{
    [Fact]
    public async Task Generates_resized_png_copies_per_class_and_skips_broken()
    {
        using var dir = new TempDir();
        TestImages.SaveSolid(Path.Combine(dir.CreateDir("hq", "ocean"), "a.jpg"), 40, 30, new Rgb24(0, 0, 200));
        TestImages.SaveSolid(Path.Combine(dir.CreateDir("hq", "desert"), "b.png"), 50, 60, new Rgb24(220, 200, 100));
        var broken = TestImages.SaveBroken(dir.Combine("hq", "desert", "c.jpg"));
        var reports = new ConcurrentBag<ProgressInfo>();

        var result = await IconGenerator.GenerateAsync(new AssetsCatalog(dir.Root), "hq", "icons", 32, parallel: true,
            new ActionProgress<ProgressInfo>(reports.Add), CancellationToken.None);

        Assert.Equal(2, result.Generated);
        Assert.Equal(new[] { broken }, result.SkippedFiles);
        using var icon = Image.Load<Rgb24>(dir.Combine("icons", "ocean", "a.png"));
        Assert.Equal(32, icon.Width);
        Assert.Equal(32, icon.Height);
        Assert.True(File.Exists(dir.Combine("icons", "desert", "b.png")));
        Assert.Equal(3, reports.Count);
        Assert.All(reports, r => Assert.Equal(IconGenerator.Stage, r.Stage));
    }

    [Fact]
    public async Task Rejects_same_source_and_target()
    {
        using var dir = new TempDir();
        dir.CreateDir("hq", "ocean");

        await Assert.ThrowsAnyAsync<ArgumentException>(() =>
            IconGenerator.GenerateAsync(new AssetsCatalog(dir.Root), "hq", "hq", 32, true, null, CancellationToken.None));
    }
}
