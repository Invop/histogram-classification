using HistogramClassification.Core.Dataset;

namespace HistogramClassification.Core.Tests;

public class AssetsCatalogTests
{
    private static TempDir CreateAssets()
    {
        var dir = new TempDir();
        void Fill(string group, string cls, int count)
        {
            var classDir = dir.CreateDir(group, cls);
            for (var i = 0; i < count; i++)
                File.WriteAllBytes(Path.Combine(classDir, $"{cls}{i}.png"), [0]);
        }
        Fill("hq", "ocean", 5);
        Fill("hq", "desert", 5);
        Fill("icons", "ocean", 3);
        Fill("icons", "desert", 3);
        File.WriteAllText(dir.Combine("hq", "ocean", "notes.txt"), "not an image");
        return dir;
    }

    [Fact]
    public void GetGroups_lists_groups_classes_and_image_counts()
    {
        using var dir = CreateAssets();

        var groups = new AssetsCatalog(dir.Root).GetGroups();

        Assert.Equal(new[] { "hq", "icons" }, groups.Select(g => g.Name));
        Assert.Equal(new[] { new AssetClass("desert", 5), new AssetClass("ocean", 5) }, groups[0].Classes);
    }

    [Fact]
    public void GetGroups_of_missing_root_is_empty() =>
        Assert.Empty(new AssetsCatalog(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString())).GetGroups());

    [Fact]
    public void BuildSplit_merges_groups_and_splits_each_class()
    {
        using var dir = CreateAssets();

        var split = new AssetsCatalog(dir.Root).BuildSplit(["hq", "icons"], perClassLimit: 0, testFraction: 0.25, seed: 1);

        Assert.Equal(new[] { "desert", "ocean" }, split.ClassNames);
        Assert.Equal(12, split.Train.Count);
        Assert.Equal(4, split.Test.Count);
        Assert.Equal(6, split.Train.Count(i => i.Label == 0));
        Assert.Empty(split.Train.Select(i => i.Path).Intersect(split.Test.Select(i => i.Path)));
    }

    [Fact]
    public void BuildSplit_respects_per_class_limit()
    {
        using var dir = CreateAssets();

        var split = new AssetsCatalog(dir.Root).BuildSplit(["hq"], perClassLimit: 4, testFraction: 0.25, seed: 1);

        Assert.Equal(6, split.Train.Count);
        Assert.Equal(2, split.Test.Count);
    }

    [Fact]
    public void BuildSplit_is_deterministic_for_seed()
    {
        using var dir = CreateAssets();
        var catalog = new AssetsCatalog(dir.Root);

        var a = catalog.BuildSplit(["hq"], 0, 0.4, seed: 7);
        var b = catalog.BuildSplit(["hq"], 0, 0.4, seed: 7);

        Assert.Equal(a.Test, b.Test);
        Assert.Equal(a.Train, b.Train);
    }

    [Fact]
    public void BuildSplit_keeps_at_least_one_training_image_per_class()
    {
        using var dir = CreateAssets();

        var split = new AssetsCatalog(dir.Root).BuildSplit(["icons"], perClassLimit: 1, testFraction: 0.9, seed: 1);

        Assert.Equal(2, split.Train.Count);
        Assert.Empty(split.Test);
    }

    [Fact]
    public void BuildSplit_rejects_unknown_group()
    {
        using var dir = CreateAssets();
        Assert.ThrowsAny<ArgumentException>(() => new AssetsCatalog(dir.Root).BuildSplit(["nope"], 0, 0.2, 1));
    }

    [Fact]
    public void BuildSplit_requires_two_classes()
    {
        using var dir = new TempDir();
        File.WriteAllBytes(Path.Combine(dir.CreateDir("g", "only"), "a.png"), [0]);

        Assert.ThrowsAny<ArgumentException>(() => new AssetsCatalog(dir.Root).BuildSplit(["g"], 0, 0, 1));
    }

    [Theory]
    [InlineData("..")]
    [InlineData("a/b")]
    [InlineData("")]
    [InlineData(" ")]
    public void IsSafeName_rejects_path_like_names(string name) => Assert.False(AssetsCatalog.IsSafeName(name));
}
