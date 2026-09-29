namespace HistogramClassification.Api;

public sealed class AppOptions
{
    public const string Section = "App";

    /// <summary>Шляхи відносно ContentRoot (папки проєкту Api).</summary>
    public string AssetsRoot { get; set; } = "../../Assets";
    public string ModelPath { get; set; } = "../../models/last.json";
    public string LogPath { get; set; } = "../../logs/app-.log";
}
