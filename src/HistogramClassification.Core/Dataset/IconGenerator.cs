using System.Collections.Concurrent;
using HistogramClassification.Core.Progress;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace HistogramClassification.Core.Dataset;

public sealed record GenerationResult(int Generated, IReadOnlyList<string> SkippedFiles);

/// <summary>Створює групу зменшених копій (напр. icons-32 з hq-4k) зі збереженням структури класів.</summary>
public static class IconGenerator
{
    public const string Stage = "generate";

    public static async Task<GenerationResult> GenerateAsync(
        AssetsCatalog catalog, string sourceGroup, string targetGroup, int size, bool parallel,
        IProgress<ProgressInfo>? progress, CancellationToken ct)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(size, 1);
        var sourceDir = catalog.GroupDirectory(sourceGroup);
        var targetDir = catalog.GroupDirectory(targetGroup);
        if (!Directory.Exists(sourceDir)) throw new ArgumentException($"Групу '{sourceGroup}' не знайдено.");
        if (string.Equals(sourceDir, targetDir, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Цільова група має відрізнятися від вихідної.");

        var jobs = Directory.EnumerateDirectories(sourceDir)
            .SelectMany(classDir => AssetsCatalog.ImageFiles(classDir).Select(file => (
                Source: file,
                Target: Path.Combine(targetDir, Path.GetFileName(classDir), Path.GetFileNameWithoutExtension(file) + ".png"))))
            .ToList();
        foreach (var dir in jobs.Select(j => Path.GetDirectoryName(j.Target)!).Distinct())
            Directory.CreateDirectory(dir);

        var skipped = new ConcurrentBag<string>();
        await BatchRunner.RunAsync(jobs.Count, parallel, Stage, i =>
        {
            try
            {
                using var image = Image.Load(jobs[i].Source);
                image.Mutate(x => x.Resize(size, size));
                image.SaveAsPng(jobs[i].Target);
            }
            catch (Exception e) when (e is ImageFormatException or IOException or NotSupportedException)
            {
                skipped.Add(jobs[i].Source);
            }
        }, progress, ct);

        return new GenerationResult(jobs.Count - skipped.Count, [.. skipped.Order(StringComparer.Ordinal)]);
    }
}
