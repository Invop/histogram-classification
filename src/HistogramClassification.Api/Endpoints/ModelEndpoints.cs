using System.Text;
using HistogramClassification.Api.Logging;
using HistogramClassification.Api.Services;
using HistogramClassification.Core.Network;

namespace HistogramClassification.Api.Endpoints;

public static class ModelEndpoints
{
    public static void MapModelEndpoints(this IEndpointRouteBuilder app)
    {
        var model = app.MapGroup("/api/model");
        model.MapGet("/", (ModelStore models) => models.Current is { } m
            ? Results.File(Encoding.UTF8.GetBytes(ModelSerializer.Serialize(m)), "application/json", "model.json")
            : ApiResults.NoModel());
        model.MapPost("/", ImportAsync);
        model.MapGet("/info", (ModelStore models) => models.Current is { } m ? Results.Ok(Info(m)) : ApiResults.NoModel());
        model.MapGet("/weights", (ModelStore models) => models.Current is { } m
            ? Results.Ok(new { classes = m.ClassNames, weights = m.Network.Weights })
            : ApiResults.NoModel());

        app.MapGet("/api/logs", (LogBuffer buffer) => buffer.Snapshot());
    }

    private static object Info(TrainedModel model) => new { classes = model.ClassNames, metadata = model.Metadata };

    private static async Task<IResult> ImportAsync(HttpRequest request, ModelStore models, CancellationToken ct)
    {
        using var reader = new StreamReader(request.Body, Encoding.UTF8);
        var json = await reader.ReadToEndAsync(ct);
        try
        {
            var model = ModelSerializer.Deserialize(json);
            models.Set(model);
            return Results.Ok(Info(model));
        }
        catch (InvalidDataException e)
        {
            return ApiResults.BadRequest(e.Message);
        }
    }
}
