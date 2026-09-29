using System.Threading.Channels;

namespace HistogramClassification.Api.Logging;

public sealed record LogEntry(DateTimeOffset Timestamp, string Level, string Message);

/// <summary>Останні записи логу для UI + канал для трансляції через SignalR.</summary>
public sealed class LogBuffer
{
    private const int Capacity = 500;
    private readonly Queue<LogEntry> _recent = new();
    private readonly Lock _lock = new();
    private readonly Channel<LogEntry> _channel = Channel.CreateBounded<LogEntry>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

    public ChannelReader<LogEntry> Reader => _channel.Reader;

    public void Add(LogEntry entry)
    {
        lock (_lock)
        {
            _recent.Enqueue(entry);
            if (_recent.Count > Capacity) _recent.Dequeue();
        }
        _channel.Writer.TryWrite(entry);
    }

    public IReadOnlyList<LogEntry> Snapshot()
    {
        lock (_lock) return [.. _recent];
    }
}
