using Serilog.Core;
using Serilog.Events;

namespace HistogramClassification.Api.Logging;

public sealed class BufferLogSink(LogBuffer buffer) : ILogEventSink
{
    public void Emit(LogEvent logEvent)
    {
        var message = logEvent.RenderMessage();
        if (logEvent.Exception is { } exception) message += $" — {exception.Message}";
        buffer.Add(new LogEntry(logEvent.Timestamp, logEvent.Level.ToString(), message));
    }
}
