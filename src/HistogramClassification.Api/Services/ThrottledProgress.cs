namespace HistogramClassification.Api.Services;

/// <summary>Пропускає не більше одного значення за interval; фінальні значення надсилаються завжди.</summary>
public sealed class ThrottledProgress<T>(Action<T> send, Func<T, bool> isFinal, TimeSpan interval) : IProgress<T>
{
    private readonly Lock _lock = new();
    private long? _lastSent;

    public void Report(T value)
    {
        var now = Environment.TickCount64;
        lock (_lock)
        {
            if (!isFinal(value) && _lastSent is { } last && now - last < (long)interval.TotalMilliseconds) return;
            _lastSent = now;
        }
        send(value);
    }
}
