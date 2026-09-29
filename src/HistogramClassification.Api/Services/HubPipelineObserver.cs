using HistogramClassification.Core.Network;
using HistogramClassification.Core.Progress;
using HistogramClassification.Core.Training;

namespace HistogramClassification.Api.Services;

public sealed class HubPipelineObserver(JobContext context, ILogger logger) : IPipelineObserver
{
    public void OnProgress(ProgressInfo progress) => context.Progress.Report(progress);

    public void OnEpoch(EpochMetrics m)
    {
        context.Epochs.Report(m);
        var step = Math.Max(1, m.TotalEpochs / 20);
        if (m.Epoch == 1 || m.Epoch == m.TotalEpochs || m.Epoch % step == 0)
            logger.LogInformation("Epoch {Epoch}/{Total}: loss {Loss:F4}, train accuracy {Train:P1}, test {Test:l}",
                m.Epoch, m.TotalEpochs, m.Loss, m.TrainAccuracy, m.TestAccuracy?.ToString("P1") ?? "—");
    }

    public void OnInfo(string message) => logger.LogInformation("{Message:l}", message);

    public void OnWarning(string message) => logger.LogWarning("{Message:l}", message);
}
