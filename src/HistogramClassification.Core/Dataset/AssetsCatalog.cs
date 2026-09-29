using HistogramClassification.Core.Features;

namespace HistogramClassification.Core.Dataset;

public sealed record AssetClass(string Name, int Count);

public sealed record AssetGroup(string Name, IReadOnlyList<AssetClass> Classes);

public sealed record DatasetSplit(
    IReadOnlyList<string> Groups,
    IReadOnlyList<string> ClassNames,
    IReadOnlyList<LabeledImage> Train,
    IReadOnlyList<LabeledImage> Test);

/// <summary>Каталог зображень Assets/&lt;група якості&gt;/&lt;клас&gt;/*.</summary>
public sealed class AssetsCatalog(string root)
{
    private static readonly HashSet<string> Extensions =
        new([".jpg", ".jpeg", ".png", ".bmp", ".webp"], StringComparer.OrdinalIgnoreCase);

    public string Root { get; } = Path.GetFullPath(root);

    public static bool IsImageFile(string path) => Extensions.Contains(Path.GetExtension(path));

    public static bool IsSafeName(string? name) =>
        !string.IsNullOrWhiteSpace(name) && name is not "." and not ".." &&
        name.IndexOfAny(Path.GetInvalidFileNameChars()) < 0;

    public static IEnumerable<string> ImageFiles(string directory) =>
        Directory.EnumerateFiles(directory).Where(IsImageFile);

    public IReadOnlyList<AssetGroup> GetGroups()
    {
        if (!Directory.Exists(Root)) return [];
        return
        [
            .. Directory.EnumerateDirectories(Root).Order(StringComparer.OrdinalIgnoreCase).Select(group => new AssetGroup(
                Path.GetFileName(group),
                [
                    .. Directory.EnumerateDirectories(group).Order(StringComparer.OrdinalIgnoreCase)
                        .Select(cls => new AssetClass(Path.GetFileName(cls), ImageFiles(cls).Count()))
                ]))
        ];
    }

    public string GroupDirectory(string group) =>
        IsSafeName(group) ? Path.Combine(Root, group) : throw new ArgumentException($"Недопустима назва групи: '{group}'.");

    public string ClassDirectory(string group, string className) =>
        IsSafeName(className)
            ? Path.Combine(GroupDirectory(group), className)
            : throw new ArgumentException($"Недопустима назва класу: '{className}'.");

    /// <summary>
    /// Об'єднує однойменні класи з вибраних груп, перемішує файли кожного класу (seed),
    /// бере не більше perClassLimit (0 — всі) і відділяє testFraction у тест (мінімум 1 у train).
    /// </summary>
    public DatasetSplit BuildSplit(IReadOnlyList<string> groups, int perClassLimit, double testFraction, int seed)
    {
        if (groups.Count == 0) throw new ArgumentException("Не вибрано жодної групи.");
        if (testFraction is < 0 or >= 1)
            throw new ArgumentOutOfRangeException(nameof(testFraction), "Частка тесту має бути в [0; 1).");

        var groupDirs = groups.Select(group =>
        {
            var dir = GroupDirectory(group);
            return Directory.Exists(dir) ? dir : throw new ArgumentException($"Групу '{group}' не знайдено в {Root}.");
        }).ToList();

        var classes = groupDirs
            .SelectMany(dir => Directory.EnumerateDirectories(dir))
            .GroupBy(dir => Path.GetFileName(dir), StringComparer.OrdinalIgnoreCase)
            .Select(g => (Name: g.Key, Files: g.SelectMany(ImageFiles).Order(StringComparer.Ordinal).ToArray()))
            .Where(c => c.Files.Length > 0)
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (classes.Count < 2)
            throw new ArgumentException("Потрібно щонайменше 2 класи із зображеннями у вибраних групах.");

        var random = new Random(seed);
        var train = new List<LabeledImage>();
        var test = new List<LabeledImage>();
        for (var label = 0; label < classes.Count; label++)
        {
            var files = classes[label].Files;
            random.Shuffle(files);
            var take = perClassLimit > 0 ? Math.Min(perClassLimit, files.Length) : files.Length;
            var testCount = Math.Min((int)Math.Round(take * testFraction, MidpointRounding.AwayFromZero), take - 1);
            test.AddRange(files.Take(testCount).Select(f => new LabeledImage(f, label)));
            train.AddRange(files.Skip(testCount).Take(take - testCount).Select(f => new LabeledImage(f, label)));
        }

        return new DatasetSplit([.. groups], [.. classes.Select(c => c.Name)], train, test);
    }
}
