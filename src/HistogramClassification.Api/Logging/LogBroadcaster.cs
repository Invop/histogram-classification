using HistogramClassification.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace HistogramClassification.Api.Logging;

/// <summary>Окремий фоновий сервіс, щоб Serilog-sink не залежав від SignalR (уникаємо циклу в DI).</summary>
public sealed class LogBroadcaster(LogBuffer buffer, IHubContext<ProgressHub> hub) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var entry in buffer.Reader.ReadAllAsync(stoppingToken))
                await hub.Clients.All.SendAsync(HubEvents.Log, entry, stoppingToken);
        }
        catch (OperationCanceledException)
        {
        }
    }
}
