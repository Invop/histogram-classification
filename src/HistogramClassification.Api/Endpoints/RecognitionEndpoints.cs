using System.Diagnostics;
using HistogramClassification.Api.Services;
using HistogramClassification.Core.Network;
using SixLabors.ImageSharp;

namespace HistogramClassification.Api.Endpoints;

public static class RecognitionEndpoints
{
    public static void MapRecognitionEndpoints(this IEndpointRouteBuilder app) =>
        app.MapPost("/api/recognize", RecognizeAsync);

    private static async Task<IResult> RecognizeAsync(HttpRequest request, ModelStore models, ILogger<ModelStore> logger, CancellationToken ct)
    {
        if (models.Current is not { } model) return ApiResults.NoModel();
        if (!request.HasFormContentType) return ApiResults.BadRequest("Очікується multipart/form-data.");
        var form = await request.ReadFormAsync(ct);
        if (form.Files.Count == 0) return ApiResults.BadRequest("Файл не передано.");

        var file = form.Files[0];
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await using var stream = file.OpenReadStream();
            var result = Recognizer.Recognize(model, stream);
            logger.LogInformation("Recognized {File:l}: {Class:l} in {Elapsed} ms", file.FileName, result.Predicted, stopwatch.ElapsedMilliseconds);
            return Results.Ok(new
            {
                result.Predicted,
                result.Outputs,
                result.Histogram,
                result.Partial,
                elapsedMs = stopwatch.ElapsedMilliseconds,
            });
        }
        catch (ImageFormatException)
        {
            return ApiResults.BadRequest("Не вдалося прочитати зображення.");
        }
    }
}
