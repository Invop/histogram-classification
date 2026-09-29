using HistogramClassification.Api.Hubs;
using HistogramClassification.Api.Services;
using HistogramClassification.Core.Dataset;

namespace HistogramClassification.Api.Endpoints;

public static class AssetsEndpoints
{
    public sealed record GenerateRequest(string Source, string Target, int Size = 32, bool Parallel = true);

    public static void MapAssetsEndpoints(this IEndpointRouteBuilder app)
    {
        var assets = app.MapGroup("/api/assets");
        assets.MapGet("/", (AssetsCatalog catalog) => Results.Ok(new { root = catalog.Root, groups = catalog.GetGroups() }));
        assets.MapPost("/generate", Generate);
        assets.MapPost("/{group}/{className}", UploadAsync);
    }

    private static async Task<IResult> UploadAsync(
        string group, string className, HttpRequest request, AssetsCatalog catalog, ILogger<AssetsCatalog> logger, CancellationToken ct)
    {
        if (!AssetsCatalog.IsSafeName(group) || !AssetsCatalog.IsSafeName(className))
            return ApiResults.BadRequest("Недопустима назва групи або класу.");
        if (!request.HasFormContentType) return ApiResults.BadRequest("Очікується multipart/form-data.");

        var form = await request.ReadFormAsync(ct);
        var directory = Directory.CreateDirectory(catalog.ClassDirectory(group, className)).FullName;
        var saved = 0;
        var rejected = new List<string>();
        foreach (var file in form.Files)
        {
            var name = Path.GetFileName(file.FileName);
            if (!AssetsCatalog.IsSafeName(name) || !AssetsCatalog.IsImageFile(name))
            {
                rejected.Add(file.FileName);
                continue;
            }
            await using var target = File.Create(Path.Combine(directory, name));
            await file.CopyToAsync(target, ct);
            saved++;
        }

        logger.LogInformation("Uploaded {Saved} files to {Group:l}/{Class:l}, rejected {Rejected}", saved, group, className, rejected.Count);
        return Results.Ok(new { saved, rejected });
    }

    private static IResult Generate(GenerateRequest body, AssetsCatalog catalog, JobRunner jobs, ILogger<AssetsCatalog> logger)
    {
        if (!AssetsCatalog.IsSafeName(body.Source) || !AssetsCatalog.IsSafeName(body.Target) ||
            string.Equals(body.Source, body.Target, StringComparison.OrdinalIgnoreCase))
            return ApiResults.BadRequest("Вкажіть різні коректні назви вихідної та цільової груп.");
        if (!Directory.Exists(catalog.GroupDirectory(body.Source)))
            return ApiResults.BadRequest($"Групу '{body.Source}' не знайдено.");
        if (body.Size is < 8 or > 1024) return ApiResults.BadRequest("Розмір має бути від 8 до 1024 px.");

        var started = jobs.TryStart(JobNames.Generate, async (context, ct) =>
        {
            logger.LogInformation("Generating {Source:l} → {Target:l} ({Size}×{Size}, {Mode:l})",
                body.Source, body.Target, body.Size, body.Size, body.Parallel ? "parallel" : "sequential");
            var result = await IconGenerator.GenerateAsync(catalog, body.Source, body.Target, body.Size, body.Parallel, context.Progress, ct);
            foreach (var file in result.SkippedFiles)
                logger.LogWarning("Skipped corrupted file: {File:l}", file);
            return result;
        }, out var jobId);
        return started ? ApiResults.Accepted(jobId) : ApiResults.Busy();
    }
}
