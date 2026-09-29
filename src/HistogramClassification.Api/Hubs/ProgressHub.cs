using Microsoft.AspNetCore.SignalR;

namespace HistogramClassification.Api.Hubs;

/// <summary>Сервер → клієнт: прогрес операцій, епохи, лог. Методів для виклику з клієнта немає.</summary>
public sealed class ProgressHub : Hub;

public static class HubEvents
{
    public const string Started = "started";
    public const string Progress = "progress";
    public const string Epoch = "epoch";
    public const string Log = "log";
    public const string Completed = "completed";
    public const string Failed = "failed";
}

public static class JobNames
{
    public const string Training = "training";
    public const string Generate = "generate";
}

public sealed record JobStarted(Guid JobId, string Name);

public sealed record JobCompleted(Guid JobId, string Name, long ElapsedMs, object? Result);

public sealed record JobFailed(Guid JobId, string Name, long ElapsedMs, string Error);
