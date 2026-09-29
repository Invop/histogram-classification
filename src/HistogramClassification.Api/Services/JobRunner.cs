using System.Diagnostics;
using HistogramClassification.Api.Hubs;
using HistogramClassification.Core.Network;
using HistogramClassification.Core.Progress;
using Microsoft.AspNetCore.SignalR;

namespace HistogramClassification.Api.Services;

/// <summary>Канали прогресу однієї операції з обмеженням частоти подій.</summary>
public sealed class JobContext(IHubContext<ProgressHub> hub, TimeSpan interval)
{
    public IProgress<ProgressInfo> Progress { get; } = new ThrottledProgress<ProgressInfo>(
        p => _ = hub.Clients.All.SendAsync(HubEvents.Progress, p),
        p => p.Done == p.Total && p.Stage != Trainer.Stage,
        interval);

    public IProgress<EpochMetrics> Epochs { get; } = new ThrottledProgress<EpochMetrics>(
        m => _ = hub.Clients.All.SendAsync(HubEvents.Epoch, m),
        m => m.Epoch == m.TotalEpochs,
        interval);
}

/// <summary>Виконує одну фонову операцію за раз, міряє час, повідомляє клієнтів і підтримує скасування.</summary>
public sealed class JobRunner(IHubContext<ProgressHub> hub, ILogger<JobRunner> logger)
{
    private static readonly TimeSpan ProgressInterval = TimeSpan.FromMilliseconds(100);
    private readonly Lock _lock = new();
    private (Guid Id, CancellationTokenSource Cts)? _current;

    public bool TryStart(string name, Func<JobContext, CancellationToken, Task<object?>> work, out Guid jobId)
    {
        CancellationTokenSource cts;
        lock (_lock)
        {
            if (_current is not null)
            {
                jobId = Guid.Empty;
                return false;
            }
            jobId = Guid.NewGuid();
            cts = new CancellationTokenSource();
            _current = (jobId, cts);
        }

        var id = jobId;
        _ = Task.Run(() => RunAsync(id, name, work, cts));
        return true;
    }

    public bool Cancel(Guid jobId)
    {
        lock (_lock)
        {
            if (_current is not { } current || current.Id != jobId) return false;
            current.Cts.Cancel();
            return true;
        }
    }

    private async Task RunAsync(Guid id, string name, Func<JobContext, CancellationToken, Task<object?>> work, CancellationTokenSource cts)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            logger.LogInformation("Job '{Job:l}' started", JobNames.Display(name));
            await hub.Clients.All.SendAsync(HubEvents.Started, new JobStarted(id, name));
            var result = await work(new JobContext(hub, ProgressInterval), cts.Token);
            logger.LogInformation("Job '{Job:l}' completed in {Elapsed} ms", JobNames.Display(name), stopwatch.ElapsedMilliseconds);
            await hub.Clients.All.SendAsync(HubEvents.Completed, new JobCompleted(id, name, stopwatch.ElapsedMilliseconds, result));
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("Job '{Job:l}' cancelled after {Elapsed} ms", JobNames.Display(name), stopwatch.ElapsedMilliseconds);
            await hub.Clients.All.SendAsync(HubEvents.Failed, new JobFailed(id, name, stopwatch.ElapsedMilliseconds, "Скасовано"));
        }
        catch (Exception e)
        {
            logger.LogError(e, "Job '{Job:l}' failed", JobNames.Display(name));
            await hub.Clients.All.SendAsync(HubEvents.Failed, new JobFailed(id, name, stopwatch.ElapsedMilliseconds, e.Message));
        }
        finally
        {
            lock (_lock) _current = null;
            cts.Dispose();
        }
    }
}
