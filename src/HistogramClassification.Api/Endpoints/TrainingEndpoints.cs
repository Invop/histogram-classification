using HistogramClassification.Api.Hubs;
using HistogramClassification.Api.Services;
using HistogramClassification.Core.Dataset;
using HistogramClassification.Core.Network;
using HistogramClassification.Core.Training;

namespace HistogramClassification.Api.Endpoints;

public static class TrainingEndpoints
{
    public sealed record TrainingRequestDto(
        string[]? Groups, int PerClassLimit, int Epochs, float LearningRate, double TestFraction, int Seed, bool Parallel);

    public sealed record TrainingSummary(
        IReadOnlyList<string> ClassNames, int TrainCount, int TestCount, IReadOnlyList<string> SkippedFiles,
        IReadOnlyList<StageTiming> Timings, IReadOnlyList<EpochMetrics> History);

    public static void MapTrainingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/training", StartTraining);
        app.MapDelete("/api/jobs/{id:guid}", (Guid id, JobRunner jobs) => jobs.Cancel(id) ? Results.NoContent() : Results.NotFound());
    }

    private static IResult StartTraining(
        TrainingRequestDto body, AssetsCatalog catalog, JobRunner jobs, ModelStore models, ILoggerFactory loggers)
    {
        if (body.Epochs is < 1 or > 100_000) return ApiResults.BadRequest("Кількість епох має бути від 1 до 100000.");
        if (!(body.LearningRate is > 0 and <= 10)) return ApiResults.BadRequest("Швидкість навчання має бути в (0; 10].");
        if (body.TestFraction is < 0 or > 0.9) return ApiResults.BadRequest("Частка тесту має бути від 0 до 0.9.");
        if (body.PerClassLimit < 0) return ApiResults.BadRequest("Ліміт на клас не може бути від'ємним.");

        DatasetSplit split;
        try
        {
            split = catalog.BuildSplit(body.Groups ?? [], body.PerClassLimit, body.TestFraction, body.Seed);
        }
        catch (ArgumentException e)
        {
            return ApiResults.BadRequest(e.Message);
        }

        var request = new TrainingRequest(split.Groups, body.PerClassLimit, body.Epochs, body.LearningRate,
            body.TestFraction, body.Seed, body.Parallel);
        var logger = loggers.CreateLogger("HistogramClassification.Training");
        var started = jobs.TryStart(JobNames.Training, async (context, ct) =>
        {
            logger.LogInformation("Параметри: епох {Epochs}, η = {LearningRate}, ліміт на клас {Limit}, тест {Test:P0}, seed {Seed}",
                request.Epochs, request.LearningRate, request.PerClassLimit, request.TestFraction, request.Seed);
            var outcome = await TrainingPipeline.RunAsync(split, request, new HubPipelineObserver(context, logger), ct);
            models.Set(outcome.Model);
            return new TrainingSummary(outcome.Model.ClassNames, outcome.Model.Metadata.TrainCount, outcome.Model.Metadata.TestCount,
                outcome.SkippedFiles, outcome.Timings, outcome.History);
        }, out var jobId);
        return started ? ApiResults.Accepted(jobId) : ApiResults.Busy();
    }
}
