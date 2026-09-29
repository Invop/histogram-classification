using HistogramClassification.Core.Network;

namespace HistogramClassification.Api.Services;

/// <summary>Поточна модель у пам'яті, продубльована у JSON-файл, щоб пережити перезапуск.</summary>
public sealed class ModelStore(string path, ILogger<ModelStore> logger)
{
    private volatile TrainedModel? _current;

    public TrainedModel? Current => _current;

    public void Set(TrainedModel model)
    {
        _current = model;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, ModelSerializer.Serialize(model));
        logger.LogInformation("Модель збережено: {Path:l}", path);
    }

    public void TryLoad()
    {
        if (!File.Exists(path)) return;
        try
        {
            var model = ModelSerializer.Deserialize(File.ReadAllText(path));
            _current = model;
            logger.LogInformation("Завантажено модель {Path:l} (класи: {Classes:l})", path, string.Join(", ", model.ClassNames));
        }
        catch (Exception e) when (e is InvalidDataException or IOException)
        {
            logger.LogWarning(e, "Не вдалося завантажити модель з {Path:l}", path);
        }
    }
}
