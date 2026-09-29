namespace HistogramClassification.Core.Progress;

/// <summary>IProgress без SynchronizationContext: викликає дію одразу в потоці, що звітує.</summary>
public sealed class ActionProgress<T>(Action<T> action) : IProgress<T>
{
    public void Report(T value) => action(value);
}
