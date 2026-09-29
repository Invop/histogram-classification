namespace HistogramClassification.Core.Progress;

/// <summary>Прогрес пакетної операції: на етапі Stage оброблено Done з Total.</summary>
public sealed record ProgressInfo(string Stage, int Done, int Total)
{
    public double Percent => Total == 0 ? 100 : 100.0 * Done / Total;
}
