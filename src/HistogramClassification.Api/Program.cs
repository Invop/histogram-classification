using HistogramClassification.Api;
using HistogramClassification.Api.Endpoints;
using HistogramClassification.Api.Hubs;
using HistogramClassification.Api.Logging;
using HistogramClassification.Api.Services;
using HistogramClassification.Core.Dataset;
using Microsoft.AspNetCore.Http.Features;
using Serilog;
using Serilog.Filters;

const long maxUploadBytes = 2L * 1024 * 1024 * 1024;

// Parallel.For у витягу ознак займає ProcessorCount потоків пулу; без запасу відповіді HTTP і SignalR
// чекали б, поки пул повільно додасть потоки, і прогрес «застигав» на перші секунди.
ThreadPool.GetMinThreads(out var minWorkers, out var minIo);
ThreadPool.SetMinThreads(Math.Max(minWorkers, Environment.ProcessorCount * 2), minIo);

var builder = WebApplication.CreateBuilder(args);
var options = builder.Configuration.GetSection(AppOptions.Section).Get<AppOptions>() ?? new AppOptions();
string Resolve(string path) => Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, path));

builder.Services.AddSingleton<LogBuffer>();
builder.Services.AddSerilog((services, logger) => logger
    .ReadFrom.Configuration(builder.Configuration)
    .WriteTo.Console()
    .WriteTo.File(Resolve(options.LogPath), rollingInterval: RollingInterval.Day,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.Logger(ui => ui
        .Filter.ByIncludingOnly(Matching.FromSource("HistogramClassification"))
        .WriteTo.Sink(new BufferLogSink(services.GetRequiredService<LogBuffer>()))));

builder.Services.AddSignalR();
builder.Services.AddProblemDetails();
builder.Services.AddHostedService<LogBroadcaster>();
builder.Services.AddSingleton(new AssetsCatalog(Resolve(options.AssetsRoot)));
builder.Services.AddSingleton(sp => new ModelStore(Resolve(options.ModelPath), sp.GetRequiredService<ILogger<ModelStore>>()));
builder.Services.AddSingleton<JobRunner>();
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = maxUploadBytes);
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = maxUploadBytes);

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapHub<ProgressHub>("/hubs/progress");
app.MapAssetsEndpoints();
app.MapTrainingEndpoints();
app.MapRecognitionEndpoints();
app.MapModelEndpoints();

var catalog = app.Services.GetRequiredService<AssetsCatalog>();
Directory.CreateDirectory(catalog.Root);
app.Logger.LogInformation("Каталог зображень: {Root:l}", catalog.Root);
app.Services.GetRequiredService<ModelStore>().TryLoad();

app.Run();
